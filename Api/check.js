// api/check.js
export default async function handler(req, res) {
    // CORS हेडर सेट करें (ताकि आपका फ्रंटएंड कॉल कर सके)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONS request (preflight) को हैंडल करें
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // सिर्फ POST स्वीकार करें
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Only POST allowed' });
    }

    // आपका Apify API टोकन (यहाँ सीधे डालें या environment variable से लें)
    const APIFY_TOKEN = 'apify_api_FnX9sipoOu4xmR94k1LpaXIWaypCk80SK1wO'; // ⚠️ अपना असली टोकन डालें

    try {
        const { phoneNumbers } = req.body;

        if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            return res.status(400).json({ error: 'Phone numbers array is required' });
        }

        const actorId = "wilcode/whatsapp-number-filter-pro";

        // 1. ऐक्टर रन शुरू करें
        const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${APIFY_TOKEN}`
            },
            body: JSON.stringify({
                phoneNumberList: phoneNumbers,
                batchSize: 50,
                proxySettings: { useApifyProxy: true }
            })
        });

        if (!runResponse.ok) {
            const errorText = await runResponse.text();
            throw new Error(`Apify run failed: ${runResponse.status} ${errorText}`);
        }

        const runData = await runResponse.json();
        const runId = runData.data.id;
        const datasetId = runData.data.defaultDatasetId;

        // 2. रन के पूरा होने का इंतज़ार करें (polling)
        let runFinished = false;
        let attempts = 0;
        const maxAttempts = 30; // 30*2 = 60 सेकंड तक wait

        while (!runFinished && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const statusResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs/${runId}`, {
                headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
            });

            if (!statusResponse.ok) continue;

            const statusData = await statusResponse.json();
            const status = statusData.data.status;

            if (status === 'SUCCEEDED') {
                runFinished = true;
                break;
            } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
                throw new Error(`Run ${status}`);
            }
            attempts++;
        }

        if (!runFinished) {
            throw new Error('Run timeout after 60 seconds');
        }

        // 3. डेटासेट से रिजल्ट लें
        const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
            headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
        });

        if (!datasetResponse.ok) {
            throw new Error('Failed to fetch dataset');
        }

        const results = await datasetResponse.json();

        // क्लाइंट को रिजल्ट भेजें
        res.status(200).json(results);

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
}
