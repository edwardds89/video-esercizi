/* classroom.js — classi, compiti e risultati degli studenti (v125). Browser + Node (test).
   L'insegnante crea classi e assegna una lezione a una classe: nasce un COMPITO con un codice di 6 caratteri.
   Lo studente apre pauselearn.com/#a=CODICE, scrive nome e cognome e fa la lezione; ogni esercizio che chiude
   viene inviato (submit_result). L'insegnante vede la tabella studenti × esercizi con le risposte date.
   Qui: dati puri (codici, testo delle risposte, tabella del report, CSV) + due "backend" con la stessa interfaccia:
   supabaseBackend (vero) e memoryBackend (test e ?mock=1, condiviso tra schede via localStorage). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./exercises.js'));
  else root.VLClass = factory(root.VLEx);
})(typeof self !== 'undefined' ? self : this, function (EX) {
  'use strict';

  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // niente 0/O, 1/I: si dettano a voce in classe
  function newCode(rand) {
    rand = rand || Math.random;
    let s = '';
    for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    return s;
  }
  function validCode(c) { return /^[A-Z0-9]{6}$/.test(String(c || '').trim().toUpperCase()); }
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  /** "  mario   ROSSI " → "mario rossi" (senza accenti): serve a riconoscere i tentativi della stessa persona. */
  function normName(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80); }
  function validName(s) { const c = cleanName(s); return c.length >= 3 && /\p{L}/u.test(c); }

  /** La risposta dello studente in parole, per il report ("cosa ha scritto/scelto"). */
  function answerText(ex, a) {
    const d = ex.data || {};
    try {
      switch (ex.type) {
        case 'gap': case 'gapbank': return (Array.isArray(a) ? a : [a]).map(function (x) { return String(x || '').trim() || '(vuoto)'; }).join(' | ');
        case 'scramble': return (Array.isArray(a) ? a : String(a || '').split(/\s+/)).join(' ');
        case 'missing':
          if (a && typeof a === 'object') {
            const before = (d.tokens || [])[Number(a.index) - 1];
            return '"' + (a.word || '') + '"' + (before ? ' dopo "' + before + '"' : ' all\'inizio');
          }
          return String(a || '');
        case 'mc': return (d.options || [])[Number(a)] != null ? d.options[Number(a)] : String(a);
        case 'extra': return (d.shown || [])[Number(a)] != null ? '"' + d.shown[Number(a)] + '"' : String(a);
        case 'wrong': {
          const w = a && typeof a === 'object' ? (d.shown || [])[Number(a.index)] : null;
          return (w != null ? '"' + w + '"' : '?') + ' → "' + ((a && a.correction) || '') + '"';
        }
      }
    } catch (e) { /* risposta in un formato inatteso: si mostra com'è */ }
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  }

  /** Punteggio di un tentativo: esercizi chiusi giusti su esercizi della lezione. */
  function scoreOf(lesson, detail) {
    const exs = (lesson && lesson.exercises) || [];
    let ok = 0;
    exs.forEach(function (e) { const r = detail && detail[e.id]; if (r && r.ok === true) ok++; });
    return { score: ok, total: exs.length };
  }
  function doneCount(detail) { return Object.keys(detail || {}).filter(function (k) { return detail[k] && detail[k].ok != null; }).length; }

  /** Più tentativi della stessa persona: vale l'ultimo CONSEGNATO (finito); se nessuno è finito, quello più avanti. */
  function pickAttempt(rows) {
    const fin = rows.filter(function (r) { return r.finished; }).sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
    if (fin.length) return fin[0];
    return rows.slice().sort(function (a, b) { return (doneCount(b.detail) - doneCount(a.detail)) || String(b.updated_at).localeCompare(String(a.updated_at)); })[0];
  }

  /** Tabella del report: righe = studenti (per nome), colonne = esercizi della lezione del compito. */
  function reportMatrix(lesson, rows) {
    const exs = ((lesson && lesson.exercises) || []).map(function (e, i) {
      return { id: e.id, n: i + 1, type: e.type, label: (EX && EX.LABELS && EX.LABELS[e.type]) || e.type, sentence: e.sentence || '', solution: EX && EX.solution ? EX.solution(e) : '' };
    });
    const groups = {};
    (rows || []).forEach(function (r) { const k = normName(r.student_name); (groups[k] = groups[k] || []).push(r); });
    const students = Object.keys(groups).map(function (k) {
      const all = groups[k], r = pickAttempt(all), det = r.detail || {};
      const cells = {};
      exs.forEach(function (e) {
        const c = det[e.id];
        cells[e.id] = !c || c.ok == null ? { state: 'none' } : {
          state: c.ok ? (c.tries && c.tries.length > 1 ? 'ok-late' : 'ok') : 'ko',
          how: c.how || (c.ok ? 'solved' : 'revealed'), tries: c.tries || [], hints: c.hints || 0
        };
      });
      const sc = scoreOf(lesson, det);
      return { key: k, name: cleanName(r.student_name), attempts: all.length, finished: !!r.finished, score: sc.score, total: sc.total,
        done: doneCount(det), started_at: r.started_at, updated_at: r.updated_at, resultId: r.id, cells: cells };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); });
    const perExercise = exs.map(function (e) {
      const done = students.filter(function (s) { return s.cells[e.id].state !== 'none'; });
      const firstTry = done.filter(function (s) { return s.cells[e.id].state === 'ok'; }).length;
      const ok = done.filter(function (s) { return s.cells[e.id].state !== 'ko'; }).length;
      return { id: e.id, done: done.length, ok: ok, firstTry: firstTry, pct: done.length ? Math.round(ok * 100 / done.length) : null };
    });
    return { exercises: exs, students: students, perExercise: perExercise };
  }

  function csvCell(v) { const s = String(v == null ? '' : v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  /** CSV (separatore ";" per Excel in italiano): una riga per studente, per ogni esercizio esito + risposte sbagliate. */
  function toCSV(m) {
    const head = ['Studente', 'Punteggio', 'Esercizi fatti', 'Consegnato', 'Tentativi', 'Ultimo invio'];
    m.exercises.forEach(function (e) { head.push(e.n + '. ' + e.label); });
    const lines = [head.map(csvCell).join(';')];
    m.students.forEach(function (s) {
      const row = [s.name, s.score + '/' + s.total, s.done, s.finished ? 'sì' : 'no', s.attempts, s.updated_at ? new Date(s.updated_at).toLocaleString('it-IT') : ''];
      m.exercises.forEach(function (e) {
        const c = s.cells[e.id];
        if (c.state === 'none') row.push('');
        else {
          const wrong = c.tries.filter(function (t) { return !t.ok; }).map(function (t) { return t.a; });
          row.push((c.state === 'ko' ? (c.how === 'skipped' ? 'saltato' : 'sbagliato') : 'giusto') + (wrong.length ? ' (' + wrong.join(' / ') + ')' : ''));
        }
      });
      lines.push(row.map(csvCell).join(';'));
    });
    return '﻿' + lines.join('\n');
  }

  // ---------- backend ----------
  function err(e) { return new Error((e && (e.message || e.details)) || String(e)); }
  function supabaseBackend(client) {
    const q = function (p) { return p.then(function (r) { if (r.error) throw err(r.error); return r.data; }); };
    return {
      kind: 'supabase',
      listClasses: function () { return q(client.from('classes').select('id,name,created_at').order('created_at')); },
      createClass: function (name) { return q(client.from('classes').insert({ name: cleanName(name) }).select('id,name,created_at').single()); },
      renameClass: function (id, name) { return q(client.from('classes').update({ name: cleanName(name) }).eq('id', id)); },
      deleteClass: function (id) { return q(client.from('classes').delete().eq('id', id)); },
      listAssignments: function () { return q(client.from('assignments').select('id,code,class_id,lesson_id,title,kind,open,created_at').order('created_at', { ascending: false })); },
      getAssignmentFull: function (id) { return q(client.from('assignments').select('*').eq('id', id).single()); },
      createAssignment: function (a) {
        const tryOnce = function (n) {
          const row = { code: newCode(), class_id: a.class_id, lesson_id: a.lesson_id, title: a.title || '', kind: a.kind || 'homework', lesson: a.lesson };
          return client.from('assignments').insert(row).select('id,code,class_id,lesson_id,title,kind,open,created_at').single().then(function (r) {
            if (r.error && r.error.code === '23505' && n < 4) return tryOnce(n + 1);   // codice già usato: se ne prova un altro
            if (r.error) throw err(r.error);
            return r.data;
          });
        };
        return tryOnce(0);
      },
      updateAssignment: function (id, patch) { return q(client.from('assignments').update(patch).eq('id', id)); },
      deleteAssignment: function (id) { return q(client.from('assignments').delete().eq('id', id)); },
      listResults: function (assignmentIds) { return q(client.from('results').select('id,assignment_id,student_name,detail,score,total,finished,started_at,updated_at').in('assignment_id', assignmentIds)); },
      countResults: function (assignmentIds) { return q(client.from('results').select('assignment_id,student_name,finished').in('assignment_id', assignmentIds)); },
      deleteResults: function (ids) { return q(client.from('results').delete().in('id', ids)); },
      // studente (anonimo)
      getAssignment: function (code) { return q(client.rpc('get_assignment', { p_code: code })); },
      submitResult: function (r) {
        return q(client.rpc('submit_result', { p_code: r.code, p_id: r.id, p_name: r.name, p_detail: r.detail, p_score: r.score, p_total: r.total, p_finished: !!r.finished }));
      }
    };
  }

  /** Backend finto con le STESSE regole del vero (compito chiuso = niente invii; un id non cambia compito). */
  function memoryBackend(storage, key) {
    key = key || 'vle.mockClassroom';
    const load = function () { try { return JSON.parse(storage.getItem(key) || '') || null; } catch (e) { return null; } };
    const db = function () { return load() || { classes: [], assignments: [], results: [] }; };
    const save = function (d) { storage.setItem(key, JSON.stringify(d)); };
    const now = function () { return new Date().toISOString(); };
    const P = function (v) { return Promise.resolve(JSON.parse(JSON.stringify(v === undefined ? null : v))); };
    const pick = function (a) { return { id: a.id, code: a.code, class_id: a.class_id, lesson_id: a.lesson_id, title: a.title, kind: a.kind, open: a.open, created_at: a.created_at }; };
    return {
      kind: 'memory',
      listClasses: function () { return P(db().classes); },
      createClass: function (name) { const d = db(); const c = { id: uuid(), name: cleanName(name), created_at: now() }; d.classes.push(c); save(d); return P(c); },
      renameClass: function (id, name) { const d = db(); d.classes.forEach(function (c) { if (c.id === id) c.name = cleanName(name); }); save(d); return P(null); },
      deleteClass: function (id) {
        const d = db(); const aIds = d.assignments.filter(function (a) { return a.class_id === id; }).map(function (a) { return a.id; });
        d.classes = d.classes.filter(function (c) { return c.id !== id; });
        d.assignments = d.assignments.filter(function (a) { return a.class_id !== id; });
        d.results = d.results.filter(function (r) { return aIds.indexOf(r.assignment_id) === -1; });
        save(d); return P(null);
      },
      listAssignments: function () { return P(db().assignments.map(pick).reverse()); },
      getAssignmentFull: function (id) { return P(db().assignments.find(function (a) { return a.id === id; })); },
      createAssignment: function (a) {
        const d = db(); let code; do { code = newCode(); } while (d.assignments.some(function (x) { return x.code === code; }));
        const row = { id: uuid(), code: code, class_id: a.class_id, lesson_id: a.lesson_id, title: a.title || '', kind: a.kind || 'homework', lesson: a.lesson, open: true, created_at: now() };
        d.assignments.push(row); save(d); return P(pick(row));
      },
      updateAssignment: function (id, patch) { const d = db(); d.assignments.forEach(function (a) { if (a.id === id) Object.assign(a, patch); }); save(d); return P(null); },
      deleteAssignment: function (id) { const d = db(); d.assignments = d.assignments.filter(function (a) { return a.id !== id; }); d.results = d.results.filter(function (r) { return r.assignment_id !== id; }); save(d); return P(null); },
      listResults: function (ids) { return P(db().results.filter(function (r) { return ids.indexOf(r.assignment_id) >= 0; })); },
      countResults: function (ids) { return P(db().results.filter(function (r) { return ids.indexOf(r.assignment_id) >= 0; }).map(function (r) { return { assignment_id: r.assignment_id, student_name: r.student_name, finished: r.finished }; })); },
      deleteResults: function (ids) { const d = db(); d.results = d.results.filter(function (r) { return ids.indexOf(r.id) === -1; }); save(d); return P(null); },
      getAssignment: function (code) {
        const d = db(); const a = d.assignments.find(function (x) { return x.code === String(code || '').trim().toUpperCase(); });
        if (!a) return P(null);
        const c = d.classes.find(function (x) { return x.id === a.class_id; }) || {};
        return P({ code: a.code, title: a.title, kind: a.kind, open: a.open, className: c.name || '', lesson: a.open ? a.lesson : null });
      },
      submitResult: function (r) {
        const d = db(); const a = d.assignments.find(function (x) { return x.code === String(r.code || '').trim().toUpperCase() && x.open; });
        if (!a) return P(false);
        const ex = d.results.find(function (x) { return x.id === r.id; });
        if (ex && ex.assignment_id !== a.id) return P(true);   // come il vero: l'update non tocca righe di altri compiti
        const row = ex || { id: r.id, assignment_id: a.id, started_at: now(), finished: false };
        row.student_name = cleanName(r.name); row.detail = r.detail; row.score = r.score; row.total = r.total;
        row.finished = !!(row.finished || r.finished); row.updated_at = now();
        if (!ex) d.results.push(row);
        save(d); return P(true);
      }
    };
  }

  return { newCode: newCode, validCode: validCode, uuid: uuid, normName: normName, cleanName: cleanName, validName: validName,
    answerText: answerText, scoreOf: scoreOf, doneCount: doneCount, pickAttempt: pickAttempt, reportMatrix: reportMatrix, toCSV: toCSV,
    supabaseBackend: supabaseBackend, memoryBackend: memoryBackend };
});
