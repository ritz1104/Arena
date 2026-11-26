import { TournamentEvent } from '../models/index.js';
import { emitActivity } from './broadcast.js';

/**
 * Persists an event in the tournament history and pushes it to the host activity feed.
 * `audit: true` marks host corrections / manual overrides.
 */
export async function logEvent(tournament, eventType, message, eventData = {}, opts = {}) {
  const ev = await TournamentEvent.create({
    tournament: tournament?._id ?? tournament ?? null,
    eventType,
    message,
    eventData,
    audit: !!opts.audit,
    actor: opts.user?._id ?? null,
  });
  const plain = ev.toObject();
  if (opts.user) plain.actorName = opts.user.name;
  emitActivity(plain);
  return ev;
}
