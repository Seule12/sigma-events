import { sendSms } from "../lib/sms";

async function test() {
  // Configuration manuelle pour le test (tirée de infobip.txt)
  process.env.INFOBIP_API_KEY = "872782b3d09dcb4ef67d0e21e4efdba3-4e2492c7-9bbe-4e2f-b124-35916e7350a5";
  process.env.INFOBIP_BASE_URL = "w4ke4y.api.infobip.com";
  process.env.INFOBIP_SENDER = "SIGMA";

  const testPhone = "+2290145793320"; // Numéro de test réel
  const testText = "🧪 Test SIGMA Events : L'intégration Infobip est active !";

  console.log(`🚀 Tentative d'envoi d'un SMS de test vers ${testPhone}...`);
  
  try {
    const result = await sendSms({ 
      to: testPhone, 
      text: testText 
    });
    
    if (result.sent) {
      console.log(`✅ SUCCÈS : SMS envoyé via ${result.via}`);
    } else {
      console.log(`❌ ÉCHEC : L'envoi a échoué (via: ${result.via})`);
    }
  } catch (e) {
    console.error("💥 Erreur critique lors du test SMS :", e);
  }
}

test();
