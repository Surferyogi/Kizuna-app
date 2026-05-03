sophiachen@Sophias-MacBook-Air kizuna-temp % cd ~/Downloads/kizuna-temp && git pull
supabase functions deploy kizuna-notify
Already up to date.
WARNING: Docker is not running
Uploading asset (kizuna-notify): supabase/functions/kizuna-notify/index.ts
Deployed Functions on project xsbohyvvghhztknikpyf: kizuna-notify
You can inspect your deployment in the Dashboard: https://supabase.com/dashboard/project/xsbohyvvghhztknikpyf/functions
sophiachen@Sophias-MacBook-Air kizuna-temp % cd ~/Downloads/kizuna-temp
cp ~/Downloads/kizuna-notify-index.ts supabase/functions/kizuna-notify/index.ts
git add supabase/functions/kizuna-notify/index.ts
git commit -m "Fix: kizuna-notify with Apple error logging"
git push
git pull
supabase functions deploy kizuna-notify
cp: /Users/sophiachen/Downloads/kizuna-notify-index.ts: No such file or directory
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	supabase/.temp/

nothing added to commit but untracked files present (use "git add" to track)
Everything up-to-date
Already up to date.
WARNING: Docker is not running
Uploading asset (kizuna-notify): supabase/functions/kizuna-notify/index.ts
Deployed Functions on project xsbohyvvghhztknikpyf: kizuna-notify
You can inspect your deployment in the Dashboard: https://supabase.com/dashboard/project/xsbohyvvghhztknikpyf/functions
sophiachen@Sophias-MacBook-Air kizuna-temp % 
