# Tafazzi Project — GitHub Pages + Supabase

Versione statica compatibile con GitHub Pages. Il frontend e il gestionale sono separati:

- `/index.html` → frontend pubblico
- `/admin/` → gestionale protetto da Supabase Auth
- Supabase Database → metadati degli audio
- Supabase Storage → file audio

## 1. Crea il progetto Supabase

1. Vai su https://supabase.com e crea un progetto.
2. Apri **SQL Editor**.
3. Incolla ed esegui `supabase/01-setup.sql`.

Lo script crea:
- tabella `audios`;
- tabella privata `admins`;
- funzione `is_admin()`;
- bucket pubblico `audio`;
- policy RLS: tutti possono leggere, solo gli admin possono aggiungere/eliminare.

## 2. Crea l'account amministratore

1. In Supabase vai su **Authentication → Users → Add user**.
2. Crea un utente con la tua email e una password sicura.
3. Copia l'UUID dell'utente.
4. Apri `supabase/02-add-admin.sql`, sostituisci `INCOLLA-QUI-UUID-UTENTE` con l'UUID e lancia la query nel SQL Editor.

Non esiste una password admin hardcoded nel repository.

## 3. Configura il sito

In Supabase apri **Project Settings → API** e copia:
- Project URL;
- Publishable key (oppure la legacy anon key, se il progetto mostra ancora quella).

Modifica `config.js`:

```js
window.TAFAZZI_CONFIG = {
  SUPABASE_URL: "https://xxxxx.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxxxx",
  AUDIO_BUCKET: "audio"
};
```

La Publishable/anon key può stare nel frontend: la sicurezza è affidata alle policy RLS. **Non inserire mai la `service_role` key in GitHub o nel browser.**

## 4. Prova in locale

Non aprire i file con `file://`. Avvia un piccolo server HTTP dalla cartella del progetto, per esempio:

```bash
python3 -m http.server 8080
```

Poi apri:
- `http://localhost:8080/` → frontend
- `http://localhost:8080/admin/` → gestionale

### Test consigliato

1. Accedi su `/admin/`.
2. Carica un MP3.
3. Verifica che appaia nell'elenco admin.
4. Apri il frontend e verifica che appaia nella Library e che venga riprodotto.
5. Torna in admin e cancellalo.
6. Aggiorna il frontend: l'audio non deve più comparire.

## 5. Pubblica su GitHub Pages

1. Crea un nuovo repository GitHub, ad esempio `tafazzi`.
2. Carica **il contenuto di questa cartella** nella root del repository.
3. Fai commit e push su `main`.
4. Su GitHub apri **Settings → Pages**.
5. In **Build and deployment**, scegli **Deploy from a branch**.
6. Seleziona `main` e `/ (root)`, poi salva.

Se il repository si chiama `tafazzi`, gli indirizzi saranno simili a:

- `https://TUO-USERNAME.github.io/tafazzi/`
- `https://TUO-USERNAME.github.io/tafazzi/admin/`

Tutti i link nel progetto sono relativi e funzionano anche nei Project Pages di GitHub.

## Aggiunta audio

Il gestionale:
1. carica il file nel bucket `audio` di Supabase Storage;
2. crea una riga nella tabella `audios` con nome, SAFE/NOT SAFE, scorciatoia e path;
3. aggiorna subito l'elenco.

Se l'inserimento nel database fallisce dopo l'upload, il codice prova a rimuovere automaticamente il file appena caricato.

## Cancellazione audio

Il gestionale:
1. elimina la riga dalla tabella `audios`;
2. elimina il file corrispondente dallo Storage;
3. aggiorna la Library.

## Sicurezza

- Il frontend pubblico può solo leggere `audios` e i file del bucket.
- Solo utenti autenticati presenti in `public.admins` possono inserire/modificare/eliminare.
- La `service_role` key non viene usata.
- Non basta essere autenticati: l'UUID deve essere inserito nella tabella `admins`.

## Piano gratuito Supabase

Il progetto è pensato per funzionare sul piano Free. Controlla sempre i limiti correnti sul sito Supabase prima della pubblicazione.
