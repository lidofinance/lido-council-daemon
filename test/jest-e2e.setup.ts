if (process.env.E2E_SILENT_LOGS === undefined) {
  process.env.E2E_SILENT_LOGS = 'true';
}

if (process.env.CHAIN_ID === undefined) {
  process.env.CHAIN_ID = '560048';
}

if (process.env.WALLET_PRIVATE_KEY === undefined) {
  process.env.WALLET_PRIVATE_KEY =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
}
