const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { Configuration, OpenAIApi } = require('openai');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
const upload = multer({ dest: 'uploads/' });


// Convert Text to SOAP Note
app.post('/api/soap-note', async (req, res) => {

  const { transcription } = req.body;

let data = JSON.stringify({
  "model": "gpt-4o-mini",
  "store": true,
  "messages": [
    {
      "role": "user",
      "content": "Generate a SOAP note from the following transcription: "+transcription
    }
  ]
});

let config = {
  method: 'post',
  maxBodyLength: Infinity,
  url: 'https://api.openai.com/v1/chat/completions',
  headers: { 
    'Content-Type': 'application/json', 
    'Authorization': 'Bearer '+process.env.OPENAI_API_KEY, 
  
  },
  data : data
};

axios.request(config)
.then((response) => {
  const soapNote = JSON.stringify(response.data)
  console.log("soapNote :",soapNote);

  res.json({ soapNote });
})
.catch((error) => {
  console.log(error);
  res.status(500).json({ error: 'SOAP note generation failed' });
});
 
});

// using AssemblyAI API
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  const audioPath = req.file.path;

  try {
    // upload audio file
    const uploadResponse = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      fs.createReadStream(audioPath),
      {
        headers: {
          'authorization': process.env.API_KEY,
          'Transfer-Encoding': 'chunked',
        },
      }
    );
    console.log("uploadResponse :",uploadResponse.data.upload_url)
    const audioUrl = uploadResponse.data.upload_url;

    // requesting for transcription
    const transcriptResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      { audio_url: audioUrl },
      {
        headers: {
          'authorization': process.env.API_KEY,
        },
      }
    );

    const transcriptId = transcriptResponse.data.id;

    // polling for transcription completion
    let transcription = null;

    while (!transcription || transcription.status !== 'completed') {
      const statusResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: {
            'authorization': process.env.API_KEY,
          },
        }
      );

      transcription = statusResponse.data;

      if (transcription.status === 'failed') {
        throw new Error('Transcription failed.');
      }

      if (transcription.status !== 'completed') {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before polling again
      }
    }

    // Send the transcription result
    res.json({ transcription: transcription.text });
  } catch (error) {
    console.error('Error transcribing audio:', error);
    res.status(500).json({ error: 'Failed to transcribe audio.' });
  } finally {
    fs.unlinkSync(audioPath); // Clean up
  }
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => console.log(`Server listening to ${PORT}`));
