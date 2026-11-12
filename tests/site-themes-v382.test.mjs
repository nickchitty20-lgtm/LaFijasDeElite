import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {themeForDate,effectiveSiteTheme,sanitizeSiteTheme} from '../src/site-themes.js';
const utc=(y,m,d,h=17)=>new Date(Date.UTC(y,m-1,d,h,0,0));
test('theme schedule resolves by Peru date, not UTC date',()=>{
 assert.equal(themeForDate(utc(2026,12,1)),'navidad');
 assert.equal(themeForDate(utc(2026,12,27)),'ano_nuevo');
 assert.equal(themeForDate(utc(2027,1,6)),'ano_nuevo');
 assert.equal(themeForDate(utc(2026,2,14)),'san_valentin');
 assert.equal(themeForDate(utc(2026,7,28)),'fiestas_patrias');
 assert.equal(themeForDate(utc(2026,10,31)),'halloween');
 assert.equal(themeForDate(utc(2026,11,2)),'halloween');
 assert.equal(themeForDate(utc(2026,9,23)),'primavera');
 assert.equal(themeForDate(utc(2026,11,12)),'elite');
 assert.equal(themeForDate(utc(2026,12,1,2)),'elite'); // Still Nov 30 in Peru
});
test('manual theme overrides calendar without losing selected intensity',()=>{
 assert.deepEqual(effectiveSiteTheme({mode:'manual',theme:'halloween',motion:'apagado'},utc(2026,12,24)),{
  mode:'manual',theme:'halloween',motion:'apagado',activeTheme:'halloween'
 });
 assert.equal(effectiveSiteTheme({mode:'automatico',theme:'halloween',motion:'normal'},utc(2026,12,24)).activeTheme,'navidad');
});
test('invalid theme values fall back to safe defaults',()=>{
 assert.deepEqual(sanitizeSiteTheme({mode:'<script>',theme:'../../',motion:'fast'}),{mode:'automatico',theme:'elite',motion:'suave'});
});
test('pages load theme script/css; panel exposes only-owner nav',()=>{
 const root=new URL('../',import.meta.url);
 const read=f=>readFileSync(new URL(f,root),'utf8');
 for(const f of ['public/index.html','public/clientes.html','views/panel.html']){
  assert.match(read(f),/seasonal-theme\.css\?v=3\.8\.4/);
  assert.match(read(f),/seasonal-theme\.js\?v=3\.8\.4/);
 }
 assert.match(read('views/panel.html'),/data-section="visual-theme"/);
 assert.match(read('views/panel.html'),/id="seasonalThemeForm"/);
 assert.match(read('public/app.js'),/owner:\[[^\]]*'visual-theme'/);
 assert.match(read('src/server.js'),/req\.admin\?\.role==='owner'/);
 assert.match(read('src/init-db.js'),/CREATE TABLE IF NOT EXISTS site_theme_settings/);
});
test('theme effects keep accessibility and CSS pointer interactions',()=>{
 const css=readFileSync(new URL('../public/seasonal-theme.css',import.meta.url),'utf8');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/data-fe-motion="apagado"/);
});

test('intense festive movement can be saved and sanitized',()=>{
 assert.equal(sanitizeSiteTheme({mode:'manual',theme:'navidad',motion:'intenso'}).motion,'intenso');
 assert.equal(effectiveSiteTheme({mode:'manual',theme:'halloween',motion:'intenso'}).activeTheme,'halloween');
});
test('all seven themes have illustrated animations and no external image requests',()=>{
 const js=readFileSync(new URL('../public/seasonal-theme.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/seasonal-theme.css',import.meta.url),'utf8');
 for (const theme of ['navidad','halloween','ano_nuevo','san_valentin','fiestas_patrias','primavera']) assert.ok(js.includes(`theme==='${theme}'`),theme);
 assert.match(js,/else\{\s*for\(let i=0;i<count\(19\)/);
 for (const fx of ['snowfall','bat-flight','ghost-drift','heart-rise','petal-fall','confetti-fall','firework-ray']) assert.match(css,new RegExp('fe-'+fx));
 assert.match(js,/getEffects:/);assert.match(css,/fe-seasonal-atmosphere.*pointer-events:none/);
 assert.doesNotMatch(js,/fetch\([\'\"]https?:\/\//);
});
