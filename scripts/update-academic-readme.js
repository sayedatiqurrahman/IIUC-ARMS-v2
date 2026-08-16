const crypto = require('crypto');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const REPO = 'sayedatiqurrahman/IIUC-ACADEMIC-FILES-MANAFGER';

function getPrivateKey() { return (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/"/g, ''); }
function generateJWT() {
  const pk = getPrivateKey(), now = Math.floor(Date.now()/1000);
  const payload = { iat: now-60, exp: now+240, iss: process.env.GITHUB_ID };
  const h = { alg: 'RS256', typ: 'JWT' };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const si = b64(h)+'.'+b64(payload);
  const s = crypto.createSign('RSA-SHA256'); s.update(si); s.end();
  return si+'.'+s.sign(pk,'base64url');
}

const NEW_README = `# IIUC-ACADEMIC-FILES-MANAFGER

Academic file storage for the **IIUC-ARMS** platform — International Islamic University Chittagong (IIUC).

## Browse Files
Files are viewable at **[iiuc-arms.eu.cc](https://iiuc-arms.eu.cc)**

## Folder Structure

Every department follows this course-based structure:

\`\`\`
upload_academic_files/{department}/{semester}/{CODE} - {Title}/
├── Mid/
│   ├── NOTES/
│   └── Previous Questions/
├── Final/
│   ├── NOTES/
│   └── Previous Questions/
├── sheet/
├── Syllabus/
└── Other/
\`\`\`

**Example:**
\`\`\`
upload_academic_files/qsis/6th-semister/QSM-3601 - Ulumul Quran/
├── Mid/
│   ├── NOTES/
│   └── Previous Questions/
├── Final/
│   ├── NOTES/
│   └── Previous Questions/
├── sheet/
├── Syllabus/
└── Other/
\`\`\`

## Departments

| Department | Folder ID | Faculty |
|---|---|---|
| Qur'anic Sciences & Islamic Studies | \`qsis\` | Shariah & Islamic Studies |
| Da'wah & Islamic Studies | \`DIS\` | Shariah & Islamic Studies |
| Science of Hadith & Islamic Studies | \`SHIS\` | Shariah & Islamic Studies |
| Computer Science & Engineering | \`cse\` | Science & Engineering |
| Computer & Communication Engineering | \`cce\` | Science & Engineering |
| Electrical & Electronic Engineering | \`eee\` | Science & Engineering |
| Electronic & Telecommunication Engineering | \`ete\` | Science & Engineering |
| Civil Engineering | \`civil\` | Science & Engineering |
| Pharmacy | \`pharmacy\` | Science & Engineering |
| Business Administration | \`ba\` | Business Studies |
| Department of Finance | \`finance\` | Business Studies |
| English Language & Literature | \`ell\` | Arts & Humanities |
| Arabic Language & Literature | \`all\` | Arts & Humanities |
| Library & Information Science | \`lis\` | Arts & Humanities |
| Department of Law | \`law\` | Law |
| Economics & Banking | \`eb\` | Social Science |
| Center for General Education | \`cge\` | General Education |

## Semesters

\`1st-semister\`, \`2nd-semister\`, \`3rd-semister\`, \`4th-semister\`, \`5th-semister\`, \`6th-semister\`, \`7th-semister\`, \`8th-semister\`

## How to Upload

1. Navigate to your department → semester → course
2. Select **Mid** or **Final** exam section
3. Choose category: **NOTES**, **Previous Questions**, **sheet**, **Syllabus**, or **Other**
4. Upload your file — it will be placed in the correct folder automatically

Or manually:
\`\`\`
upload_academic_files/{department}/{semester}/{CODE} - {Title}/{Mid|Final}/{NOTES|Previous Questions}/{filename}
\`\`\`

## Contributing

1. **Fork** this repository
2. Navigate to \`upload_academic_files/{your-department}/{semester}/{CODE} - {Title}/\`
3. Upload your files into the correct category folder
4. Create a **Pull Request**

> **Note:** Only IIUC departmental emails (\`@ugrad.iiuc.ac.bd\` or \`@iiuc.ac.bd\`) are accepted.

---

*Presented by **Programming Light** & Developed by **Sayed Atiqur Rahman***
`;

async function main() {
  const jwt = generateJWT();
  const r1 = await fetch('https://api.github.com/app/installations', { headers: { Authorization: 'Bearer '+jwt } });
  const insts = await r1.json();
  const r2 = await fetch('https://api.github.com/app/installations/'+insts[0].id+'/access_tokens', { method:'POST', headers: { Authorization: 'Bearer '+jwt } });
  const d2 = await r2.json();
  const token = d2.token;

  const r3 = await fetch('https://api.github.com/repos/'+REPO+'/contents/README.md', { headers: { Authorization: 'Bearer '+token } });
  const data = await r3.json();
  const sha = data.sha;

  const encoded = Buffer.from(NEW_README).toString('base64');
  const r4 = await fetch('https://api.github.com/repos/'+REPO+'/contents/README.md', {
    method: 'PUT',
    headers: { Authorization: 'Bearer '+token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'docs: update README with course-based folder structure', content: encoded, sha })
  });
  console.log('Update README:', r4.status, r4.ok ? 'OK' : 'FAIL');
  if (!r4.ok) console.log(await r4.text());
}

main().catch(e => console.error(e));
