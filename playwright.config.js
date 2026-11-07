import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./test/browser', workers:1,
  use:{ignoreHTTPSErrors:true,baseURL:'http://127.0.0.1:4173', launchOptions:{
    ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),

  }},
  webServer:{command:'npm run preview -- --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false},
});
