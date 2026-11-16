import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { PollOption, PollSummary } from '../types/cinema';
import { getOrCreateVisitorId } from './analyticsService';

const POLL_LOCAL_KEY = 'az_poll_votes_v1';

function getLocalPollVotes(): Record<string, PollOption> {
  try {
    const raw = localStorage.getItem(POLL_LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, PollOption>;
  } catch {
    return {};
  }
}

function saveLocalPollVote(pollId: string, option: PollOption): void {
  try {
    const current = getLocalPollVotes();
    current[pollId] = option;
    localStorage.setItem(POLL_LOCAL_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage restriction
  }
}

export function subscribePollResults(
  pollId: string,
  onUpdate: (summary: PollSummary) => void
): Unsubscribe {
  const safePollId = /^[a-zA-Z0-9_-]{1,64}$/.test(pollId) ? pollId : 'poll-v1';
  const visitorId = getOrCreateVisitorId();
  const ownVoteId = `${safePollId}__${visitorId}`.slice(0, 128);
  const localChoice = getLocalPollVotes()[safePollId] || null;

  onUpdate({
    countA: localChoice === 'A' ? 1 : 0,
    countB: localChoice === 'B' ? 1 : 0,
    userChoice: localChoice,
  });

  const q = query(collection(db, 'poll_votes'), where('pollId', '==', safePollId));
  return onSnapshot(
    q,
    (snap) => {
      let countA = 0;
      let countB = 0;
      let remoteChoice: PollOption | null = null;

      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (data.option === 'A') countA += 1;
        else if (data.option === 'B') countB += 1;
        if (d.id === ownVoteId && (data.option === 'A' || data.option === 'B')) {
          remoteChoice = data.option;
          saveLocalPollVote(safePollId, data.option);
        }
      }

      const resolvedChoice = remoteChoice || getLocalPollVotes()[safePollId] || null;
      if (resolvedChoice === 'A' && countA === 0) countA = 1;
      if (resolvedChoice === 'B' && countB === 0) countB = 1;

      onUpdate({
        countA,
        countB,
        userChoice: resolvedChoice,
      });
    },
    () => {
      const fallbackChoice = getLocalPollVotes()[safePollId] || null;
      onUpdate({
        countA: fallbackChoice === 'A' ? 1 : 0,
        countB: fallbackChoice === 'B' ? 1 : 0,
        userChoice: fallbackChoice,
      });
    }
  );
}

export async function submitPollVote(pollId: string, option: PollOption): Promise<boolean> {
  const safePollId = /^[a-zA-Z0-9_-]{1,64}$/.test(pollId) ? pollId : 'poll-v1';
  const existingLocal = getLocalPollVotes()[safePollId];
  if (existingLocal) return false;

  saveLocalPollVote(safePollId, option);
  const visitorId = getOrCreateVisitorId();
  const voteId = `${safePollId}__${visitorId}`.slice(0, 128);

  try {
    await setDoc(doc(db, 'poll_votes', voteId), {
      voteId,
      pollId: safePollId,
      visitorId,
      option,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Poll vote sync deferred:', err);
  }
  return true;
}
