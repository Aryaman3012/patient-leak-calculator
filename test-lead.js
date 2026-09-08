const fs = require('fs');
const html = fs.readFileSync('leak-calculator.html', 'utf8');
const src = html.split('// ---- LEAD START ----')[1].split('// ---- LEAD END ----')[0];
const { normalisePhone, validateLead, utmFrom } =
  (new Function('URLSearchParams', src + '\nreturn {normalisePhone, validateLead, utmFrom};'))(URLSearchParams);

let fail = 0;
function ok(name, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   ' + extra));
  if (!cond) fail++;
}

// what UAE clinic staff actually type
const phones = [
  ['050 123 4567',      '+971501234567'],
  ['0501234567',        '+971501234567'],
  ['50 123 4567',       '+971501234567'],
  ['501234567',         '+971501234567'],
  ['+971 50 123 4567',  '+971501234567'],
  ['971501234567',      '+971501234567'],
  ['04 123 4567',       '+97141234567'],   // Dubai landline
  ['+44 20 7946 0018',  '+442079460018'],  // international pasted in full
  ['(050) 123-4567',    '+971501234567'],
];
phones.forEach(([input, want]) =>
  ok(`phone "${input}" -> ${want}`, normalisePhone(input) === want, `got ${normalisePhone(input)}`));

const junk = ['', '   ', 'abc', '123', '1234567', 'call me', '+', '01234567890123456789'];
junk.forEach(j => ok(`rejects junk phone ${JSON.stringify(j)}`, normalisePhone(j) === null, `got ${normalisePhone(j)}`));

// all three fields mandatory
const full = { name: 'Layla Haddad', clinic: 'Jumeirah Skin & Laser', phone: '0501234567' };
ok('a complete lead validates', validateLead(full).valid);
ok('name is mandatory', !validateLead({ ...full, name: '' }).valid);
ok('name is mandatory when whitespace only', !validateLead({ ...full, name: '   ' }).valid);
ok('clinic is mandatory', !validateLead({ ...full, clinic: '' }).valid);
ok('phone is mandatory', !validateLead({ ...full, phone: '' }).valid);
ok('single-character name rejected', !validateLead({ ...full, name: 'A' }).valid);
ok('every missing field reports its own error',
   Object.keys(validateLead({ name: '', clinic: '', phone: '' }).errors).sort().join(',') === 'clinic,name,phone');
ok('undefined input does not throw', !validateLead({}).valid);

// stored values are normalised, not raw
const v = validateLead({ name: '  Layla   Haddad ', clinic: ' Jumeirah  Skin ', phone: '050 123 4567' });
ok('name is trimmed and inner whitespace collapsed', v.lead.name === 'Layla Haddad', `got "${v.lead.name}"`);
ok('clinic is trimmed and collapsed', v.lead.clinic === 'Jumeirah Skin', `got "${v.lead.clinic}"`);
ok('phone is stored as E.164', v.lead.phone === '+971501234567', `got ${v.lead.phone}`);

// campaign attribution
const u = utmFrom('?utm_source=meta&utm_campaign=leak-q3&irrelevant=1');
ok('captures utm params', u.utm_source === 'meta' && u.utm_campaign === 'leak-q3');
ok('ignores non-utm params', !('irrelevant' in u));
ok('empty query yields no utm keys', Object.keys(utmFrom('')).length === 0);

console.log('\n' + (fail ? fail + ' FAILING' : 'all checks pass'));
process.exit(fail ? 1 : 0);
