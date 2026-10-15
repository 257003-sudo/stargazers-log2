# 予定一覧表示の更新手順

今回はフロントエンド3ファイルと、Pythonサーバーの1ファイルを更新します。
コピー・貼り付けせず、ZIPを解凍してファイルを置き換えてください。

1. 現在のファイルをバックアップします。
2. ZIP内の web-app/index.html、style.css、app.js の3つを、現在のWebアプリの同名ファイルと置き換えます。
3. ZIP内の python-server/main.py を、現在起動しているFastAPIサーバーの main.py と置き換えます。
   ZIPのフォルダを新しい環境として使うのではなく、既存のサーバーフォルダに配置してください。
   既存の .env とFirebaseのサービスアカウントJSONはそのまま残してください。
   Firestore初期化・秘密鍵・Geminiの設定は送付された main.py のままです。新しい秘密情報は不要です。
4. Pythonサーバーを再起動します。元の python-server フォルダで、従来どおり起動してください。
   py -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
5. Web画面を再読み込みし、必要ならログインし直します。
6. カレンダーを選ぶと、そのカレンダーの予定が開始日時順に表示されます。
   AI予定を登録すると、予定一覧も自動で更新されます。
   「予定一覧を更新」ボタンでも再取得できます。

追加API: GET /calendars/{calendar_id}/events
owner/editor/viewerのみ取得できます。認証には既存のBearer JWTを使います。
FirestoreはcalendarIdだけで絞り込み、日時順の並び替えはサーバー内で行うため、追加の複合インデックスは不要です。
日時は画面で日本時間に変換します。予定0件・読み込み失敗も別々に表示します。
カレンダー切替やログアウト後に、古いリクエストの結果が画面に戻らないようにしています。

検証:
- APIテスト8件（登録後取得、カレンダーごとの絞り込み、日時順、空一覧、閲覧権限、無効/期限切れトークン）成功。
- ブラウザで一覧・日本時間・AI登録後更新・空一覧・エラー・切替時の応答順逆転・ログアウトを確認。
- APIテストとブラウザ検証ではFirestoreをメモリ内の代替データストアにしています。
- 実際のFirestore・Geminiへの接続は未検証です。手元で登録済み予定が表示されるか確認してください。

開発用テスト（GitHubのソース一式で実行）:
python -m unittest discover -s python-server/tests -v
python web-app/tests/event_list_smoke.py
後者にはPython PlaywrightとChromiumが必要です。
