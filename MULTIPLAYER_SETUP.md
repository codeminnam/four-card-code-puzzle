# Online Multiplayer Setup

The game uses Supabase Realtime Broadcast for two-player races. No database tables or SQL policies are required. The room ID is a random, unguessable value in the invite URL; anyone with that link can join, so only share it with your friend. The host must stay online during the match.

## Configure Supabase

1. Create a Supabase project on the Free plan at https://supabase.com/dashboard.
2. In the project Connect dialog, copy the Project URL and the publishable key (`sb_publishable_...`).
3. Put those values in `supabase-config.js`:

```js
window.FOUR_CARD_SUPABASE_CONFIG = {
  url: 'https://your-project.supabase.co',
  publishableKey: 'sb_publishable_your-public-key'
};
```

4. Commit and publish the updated config file to GitHub Pages.
5. Open the game, choose **2인 대결**, and send the generated invite link to your friend.

Do not use or publish a secret/service-role key. The publishable key is intended for browser use.

The Supabase Free plan currently includes 2 million Realtime messages and 200 peak connections. Free projects pause after one week of inactivity and may need to be resumed from the Supabase dashboard.
