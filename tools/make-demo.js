/* Genera demo-data.js dalla trascrizione sintetica dei test: `node tools/make-demo.js` */
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('../test/fixture.js');
const y = F.youtubeTranscript();
const out = '/* demo-data.js — trascrizione sintetica per la lezione demo (player finto). Generato da tools/make-demo.js */\n' +
  'window.VL_DEMO = ' + JSON.stringify({ title: 'Demo: come funziona il cervello (trascrizione inventata)', duration: y.duration, transcript: y.text }, null, 0) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'demo-data.js'), out);
console.log('demo-data.js scritto:', out.length, 'byte, durata', y.duration, 's');
