/**
 * Pre-publication calendar checks shared by the owner preview, explicit
 * reanalysis, and final publication. Historical community files are not a
 * real-time match-status feed; a recently verified independent NS schedule
 * can safely supersede an older community-file timestamp.
 *
 * No stale snapshot, concluded match, changed kickoff or unverifiable live
 * requirement is ever treated as cleared solely because a draft is old.
 */
const HOUR = 3600000;
const asMillis = value => {
 if(value == null || value === '') return NaN;
 const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T') +
  (/(?:Z|[+-]\d\d:\d\d)$/.test(String(value)) ? '' : 'Z'));
 return date.getTime();
};
const failure = (code, message, action) => ({ready:false, code, message, action});

export function nforceSourceReadiness(source, candidateKickoff, {now = Date.now(), requireLive = false} = {}) {
 const current = now instanceof Date ? now.getTime() : Number(now);
 const planned = asMillis(candidateKickoff);
 if(!Number.isFinite(planned) || planned <= current + 20 * 60000)
  return failure('kickoff_passed', 'El partido comenzó o empieza en menos de 20 minutos. No se puede publicar.', 'none');
 if(!source || !Number.isFinite(asMillis(source.kickoff)))
  return failure('fixture_missing', 'No se encontró un horario válido para este encuentro. Importa datos deportivos y reanaliza esta propuesta.', 'import_data');
 if(source.home_goals != null || source.away_goals != null ||
    (source.live_status && String(source.live_status).toUpperCase() !== 'NS'))
  return failure('started_or_finished', 'El encuentro ya comenzó, terminó o su estado no permite publicarlo.', 'none');
 const actual = asMillis(source.kickoff);
 if(actual <= current + 20 * 60000)
  return failure('kickoff_passed', 'El partido comenzó o empieza en menos de 20 minutos. No se puede publicar.', 'none');
 if(Math.abs(actual - planned) > 60000)
  return failure('schedule_changed', 'Cambió el horario del encuentro. Usa «Reanalizar esta propuesta»; no hace falta crear otra.', 'reanalyze');
 const age = checked => current - asMillis(checked);
 const isFresh = (checked, hours) => Number.isFinite(age(checked)) && age(checked) >= 0 && age(checked) <= hours * HOUR;
 const verifiedLive = isFresh(source.schedule_verified_at, 4) &&
  String(source.live_status || '').toUpperCase() === 'NS';
 const freshCommunity = isFresh(source.source_checked_at, 36);
 if(requireLive && !verifiedLive)
  return failure('live_verification_missing', 'Falta una comprobación reciente del horario y estado del partido. Actualiza la verificación de calendario antes de publicar.', 'verify_schedule');
 // With a configured independent status feed, its fresh pre-kickoff NS status
 // is more authoritative than the delayed community import timestamp.
 if(!freshCommunity && !(requireLive && verifiedLive))
  return failure('calendar_stale', 'El calendario local lleva más de 36 horas sin actualizarse para este partido. Importa datos deportivos y luego usa «Reanalizar esta propuesta».', 'import_data');
 return {ready:true,code:'ready',message:'Calendario apto para revisión y publicación.',action:'none',
  verified_schedule:requireLive && verifiedLive,community_fresh:freshCommunity};
}
