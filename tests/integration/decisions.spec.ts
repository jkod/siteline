import { inviteClientHandler } from '../../functions/src/callables/clients';
import {
  deleteDecisionDraftHandler,
  exportDecisionsCsvHandler,
  respondToDecisionHandler,
  reviseDecisionHandler,
  saveDecisionDraftHandler,
  sendDecisionHandler,
  withdrawDecisionHandler,
} from '../../functions/src/callables/decisions';
import { createProjectHandler } from '../../functions/src/callables/projects';
import {
  addStaff,
  companyWithOwner,
  db,
  failure,
  outbox,
  request,
  resetEmulators,
  signedInUser,
  type TestCaller,
} from './harness';

beforeEach(resetEmulators);

const extraWork = {
  kind: 'extra_work',
  title: 'Byt rutten golvbjälke',
  priceOre: 650_000,
  labourOre: 400_000,
  materialOre: 250_000,
};

async function setup() {
  const owner = await companyWithOwner('c1', 'erik', 'team');
  await addStaff('c1', 'omar', 'crew', 'Omar');
  const crew = await signedInUser('omar', 'omar@example.com', { cid: 'c1', crole: 'crew' });
  const { projectId } = await createProjectHandler(
    request(owner, { title: 'Köksrenovering Lindqvist', crewUids: ['omar'] }),
  );
  const { uid } = await inviteClientHandler(
    request(owner, { projectId, name: 'Anna Lindqvist', phone: '0701740605' }),
  );
  const client: TestCaller = { uid, token: { kind: 'client' } };
  return { owner, crew, client, projectId };
}

async function draftAndSend(
  caller: TestCaller,
  projectId: string,
  decision: Record<string, unknown> = extraWork,
) {
  const { postId } = await saveDecisionDraftHandler(request(caller, { projectId, decision }));
  await sendDecisionHandler(request(caller, { projectId, postId }));
  return postId;
}

const post = async (projectId: string, postId: string) =>
  (await db.doc(`projects/${projectId}/posts/${postId}`).get()).data()!;
const totals = async (projectId: string) =>
  (await db.doc(`projects/${projectId}`).get()).get('totals');

describe('decision lifecycle', () => {
  it('keeps drafts staff-only and nothing is sent until the card is sent', async () => {
    const { owner, projectId } = await setup();
    const { postId } = await saveDecisionDraftHandler(
      request(owner, { projectId, decision: extraWork }),
    );
    const draft = await post(projectId, postId);
    expect(draft).toMatchObject({
      type: 'decision',
      visibility: 'staff',
      decision: { status: 'draft', version: 1, priceOre: 650_000 },
    });
    expect((await outbox()).filter((m) => m.template === 'decisionSent')).toHaveLength(0);

    await sendDecisionHandler(request(owner, { projectId, postId }));
    expect(await post(projectId, postId)).toMatchObject({
      visibility: 'all',
      decision: { status: 'sent' },
    });
    expect(await totals(projectId)).toMatchObject({ openDecisions: 1 });
    const [text] = (await outbox()).filter((m) => m.template === 'decisionSent');
    expect(text).toMatchObject({ channel: 'sms', params: { title: 'Byt rutten golvbjälke' } });
    expect(text!.params['price']).toBe('6 500 kr');
  });

  it('lets crew send priced cards only when the company allows it (PRD section 2)', async () => {
    const { crew, projectId } = await setup();
    const { postId } = await saveDecisionDraftHandler(
      request(crew, { projectId, decision: extraWork }),
    );
    expect((await failure(sendDecisionHandler(request(crew, { projectId, postId })))).message).toBe(
      'crew_cannot_send_priced',
    );
    await expect(
      draftAndSend(crew, projectId, { kind: 'approval', title: 'Är kakelmönster B okej?' }),
    ).resolves.toBeTruthy();
    await db.doc('companies/c1').update({ 'settings.crewCanSendPricedCards': true });
    await expect(sendDecisionHandler(request(crew, { projectId, postId }))).resolves.toEqual({
      ok: true,
    });
  });

  it('approves once: one approval record with a snapshot and hash, and the total updates (PRD F6)', async () => {
    const { owner, client, projectId } = await setup();
    const postId = await draftAndSend(owner, projectId);
    const { approvalId } = await respondToDecisionHandler(
      request(client, { projectId, postId, version: 1, outcome: 'approved' }),
    );

    const approval = (await db.doc(`projects/${projectId}/approvals/${approvalId}`).get()).data()!;
    expect(approval).toMatchObject({
      postId,
      version: 1,
      outcome: 'approved',
      priceOre: 650_000,
      actorName: 'Anna Lindqvist',
      actorPhoneMasked: '+46 70 *** ** 05',
      phoneVerified: false,
    });
    expect(approval['snapshot']).toMatchObject({
      title: 'Byt rutten golvbjälke',
      priceOre: 650_000,
      version: 1,
    });
    expect(approval['snapshotSha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(await post(projectId, postId)).toMatchObject({
      decision: { status: 'approved', approvalId },
    });
    expect(await totals(projectId)).toMatchObject({
      openDecisions: 0,
      approvedExtraWorkOre: 650_000,
    });

    // A repeated call for the same version is rejected, and no second record exists.
    const again = await failure(
      respondToDecisionHandler(
        request(client, { projectId, postId, version: 1, outcome: 'approved' }),
      ),
    );
    expect(again.message).toBe('decision_not_open');
    expect((await db.collection(`projects/${projectId}/approvals`).get()).size).toBe(1);

    const staffEmails = (await outbox()).filter((m) => m.template === 'decisionAnswered');
    expect(staffEmails.map((m) => m.to.uid)).toEqual(['erik']);
    expect(staffEmails[0]!.params['outcome']).toBe('godkänt');
  });

  it('records a decline with its reason, and a choice with its price difference', async () => {
    const { owner, client, projectId } = await setup();
    const declined = await draftAndSend(owner, projectId);
    await respondToDecisionHandler(
      request(client, {
        projectId,
        postId: declined,
        version: 1,
        outcome: 'declined',
        reason: 'För dyrt',
      }),
    );
    expect(await post(projectId, declined)).toMatchObject({
      decision: { status: 'declined', declineReason: 'För dyrt' },
    });

    const choice = await draftAndSend(owner, projectId, {
      kind: 'choice',
      title: 'Välj kakel',
      options: [
        { id: 'a', label: 'Vitt blankt' },
        { id: 'b', label: 'Grönt matt', priceDeltaOre: 120_000 },
      ],
    });
    expect(
      (
        await failure(
          respondToDecisionHandler(
            request(client, { projectId, postId: choice, version: 1, outcome: 'approved' }),
          ),
        )
      ).message,
    ).toBe('invalid_outcome');
    const { approvalId } = await respondToDecisionHandler(
      request(client, { projectId, postId: choice, version: 1, outcome: 'chosen', optionId: 'b' }),
    );
    expect(
      (await db.doc(`projects/${projectId}/approvals/${approvalId}`).get()).data(),
    ).toMatchObject({ outcome: 'chosen', optionId: 'b', priceOre: 120_000 });
    expect(await post(projectId, choice)).toMatchObject({
      decision: { status: 'approved', selectedOptionId: 'b' },
    });
    // Only approved extra work counts towards the total.
    expect(await totals(projectId)).toMatchObject({ approvedExtraWorkOre: 0 });
  });

  it('supersedes on edit: the old version is read-only and answers to it are rejected', async () => {
    const { owner, client, projectId } = await setup();
    const v1 = await draftAndSend(owner, projectId);
    const { postId: v2 } = await reviseDecisionHandler(
      request(owner, {
        projectId,
        postId: v1,
        decision: { ...extraWork, priceOre: 590_000, labourOre: 340_000 },
      }),
    );
    expect(await post(projectId, v1)).toMatchObject({ decision: { status: 'superseded' } });
    expect(await post(projectId, v2)).toMatchObject({
      decision: { status: 'sent', version: 2, supersedesPostId: v1, priceOre: 590_000 },
    });
    expect(
      (
        await failure(
          respondToDecisionHandler(
            request(client, { projectId, postId: v1, version: 1, outcome: 'approved' }),
          ),
        )
      ).message,
    ).toBe('decision_not_open');
    expect(
      (
        await failure(
          respondToDecisionHandler(
            request(client, { projectId, postId: v2, version: 1, outcome: 'approved' }),
          ),
        )
      ).message,
    ).toBe('decision_changed');
    await respondToDecisionHandler(
      request(client, { projectId, postId: v2, version: 2, outcome: 'approved' }),
    );
    expect(await totals(projectId)).toMatchObject({
      approvedExtraWorkOre: 590_000,
      openDecisions: 0,
    });
    expect((await outbox()).filter((m) => m.template === 'decisionChanged')).toHaveLength(1);
  });

  it('withdraws a sent card and never lets a final state change', async () => {
    const { owner, client, projectId } = await setup();
    const postId = await draftAndSend(owner, projectId);
    await withdrawDecisionHandler(request(owner, { projectId, postId }));
    expect(await post(projectId, postId)).toMatchObject({ decision: { status: 'withdrawn' } });
    expect(
      (
        await failure(
          respondToDecisionHandler(
            request(client, { projectId, postId, version: 1, outcome: 'approved' }),
          ),
        )
      ).message,
    ).toBe('decision_not_open');
    expect(
      (await failure(withdrawDecisionHandler(request(owner, { projectId, postId })))).message,
    ).toBe('decision_not_open');
    expect(
      (
        await failure(
          reviseDecisionHandler(request(owner, { projectId, postId, decision: extraWork })),
        )
      ).message,
    ).toBe('decision_not_open');
    expect(
      (await failure(deleteDecisionDraftHandler(request(owner, { projectId, postId })))).message,
    ).toBe('decision_not_draft');
  });

  it("never lets staff answer on a client's behalf", async () => {
    const { owner, projectId } = await setup();
    const postId = await draftAndSend(owner, projectId);
    expect(
      (
        await failure(
          respondToDecisionHandler(
            request(owner, { projectId, postId, version: 1, outcome: 'approved' }),
          ),
        )
      ).code,
    ).toBe('permission-denied');
  });

  it('exports sent decisions as CSV with who decided', async () => {
    const { owner, client, projectId } = await setup();
    const postId = await draftAndSend(owner, projectId);
    await saveDecisionDraftHandler(
      request(owner, { projectId, decision: { kind: 'approval', title: 'Utkast' } }),
    );
    await respondToDecisionHandler(
      request(client, { projectId, postId, version: 1, outcome: 'approved' }),
    );
    const { csv, filename } = await exportDecisionsCsvHandler(request(owner, { projectId }));
    expect(filename).toBe('beslut-köksrenovering-lindqvist.csv');
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Byt rutten golvbjälke;extra_work;approved;1;6 500 kr;');
    expect(lines[1]).toContain(';Anna Lindqvist;');
  });

  it('validates cards', async () => {
    const { owner, projectId } = await setup();
    const bad = async (decision: Record<string, unknown>) =>
      (await failure(saveDecisionDraftHandler(request(owner, { projectId, decision })))).code;
    expect(await bad({ kind: 'extra_work', title: 'Utan pris' })).toBe('invalid-argument');
    expect(
      await bad({ kind: 'choice', title: 'Ett val', options: [{ id: 'a', label: 'A' }] }),
    ).toBe('invalid-argument');
    expect(await bad({ ...extraWork, labourOre: 600_000, materialOre: 100_000 })).toBe(
      'invalid-argument',
    );
  });
});
