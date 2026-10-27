/* Site details shown on the "Acerca de" (About) page.
 * Fill these in before sharing the site with other teachers. Anything left
 * empty is simply not shown. */
window.LL = window.LL || {};
LL.config = {
  // Set by tools/stamp_version.py on every publish.
  build: '20261027032731',
  version: 'V126',
  // Who runs this site, e.g. 'Sra. García · Escuela Primaria Lincoln'
  owner: 'Geovanny Cobos',
  // How people can reach you about privacy or problems, e.g. an email address
  contact: '',
  // Supabase project used for teacher sign-in and cloud sync. The publishable
  // key is designed to be public; the database's row-level security decides
  // what each signed-in teacher can see. Leave both empty to run without accounts.
  supabaseUrl: 'https://abbtbaupzdzdvtkunmtf.supabase.co',
  supabaseKey: 'sb_publishable_u15W-YbsRlA3JnS-nRX39A_pI_0tTQ9',
  // Where password-reset and invitation emails send people back to.
  siteUrl: 'https://gcobos79.github.io/Little-Learners-Activities/',
  // Date the privacy policy and terms were last updated
  policyUpdated: '25 de octubre de 2026',
};
