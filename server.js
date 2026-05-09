const express = require('express');
const session = require('express-session');
const fs = require('fs-extra');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================
// API SECURITY KEY
// ======================

const API_KEY = "SISTEC2026";

// ======================
// LAST DEVICE STATUS
// ======================

let lastSeen = null;
let latestPrediction = "Waiting for AI...";

// ======================
// MIDDLEWARE
// ======================

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static('public'));

app.use(session({
    secret: 'sistec-iot-secret-2026',
    resave: false,
    saveUninitialized: true
}));

// ======================
// FILE PATHS
// ======================

const dataDir = path.join(__dirname, 'data');

const usersPath = path.join(dataDir, 'users.json');

const sensorPath = path.join(dataDir, 'sensor_data.json');

const lcdPath = path.join(dataDir, 'lcd.txt');

// ======================
// INITIALIZE DATABASE
// ======================

async function initDB() {

    await fs.ensureDir(dataDir);

    if (!(await fs.pathExists(usersPath))) {
        await fs.writeJson(usersPath, []);
    }

    if (!(await fs.pathExists(sensorPath))) {
        await fs.writeJson(sensorPath, []);
    }

    if (!(await fs.pathExists(lcdPath))) {
        await fs.writeFile(lcdPath, 'SISTec IoT 2026');
    }
}

initDB();

// ======================
// KOLKATA TIME FUNCTION
// ======================

function getKolkataTime() {

    const now = new Date();

    const time = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const date = now.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).replace(/\//g, '-');

    return { time, date };
}

// ======================
// LOGIN CHECK MIDDLEWARE
// ======================

function checkAuth(req, res, next) {

    if (req.session.user) {
        next();
    } else {
        res.redirect('/');
    }
}

// ======================
// AUTH ROUTES
// ======================

// REGISTER

app.post('/register', async (req, res) => {

    try {

        const { name, email, password } = req.body;

        const users = await fs.readJson(usersPath);

        const existingUser = users.find(u => u.email === email);

        if (existingUser) {
            return res.send(`
                <h2>User Already Exists</h2>
                <a href="/register.html">Try Again</a>
            `);
        }

        users.push({
            name,
            email,
            password
        });

        await fs.writeJson(usersPath, users);

        res.redirect('/');

    } catch (error) {

        console.log(error);

        res.status(500).send('SERVER ERROR');
    }
});

// LOGIN

app.post('/login', async (req, res) => {

    try {

        const { email, password } = req.body;

        const users = await fs.readJson(usersPath);

        const user = users.find(
            u => u.email === email && u.password === password
        );

        if (user) {

            req.session.user = user;

            res.redirect('/dashboard.html');

        } else {

            res.send(`
                <h2>Invalid Credentials</h2>
                <a href="/">Back to Login</a>
            `);
        }

    } catch (error) {

        console.log(error);

        res.status(500).send('SERVER ERROR');
    }
});

// LOGOUT

app.get('/logout', (req, res) => {

    req.session.destroy();

    res.redirect('/');
});

// ======================
// PROTECTED DASHBOARD
// ======================

app.get('/dashboard.html', checkAuth, (req, res) => {

    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ======================
// WEB APIs
// ======================

// GET USER

app.get('/api/user', (req, res) => {

    if (req.session.user) {

        res.json(req.session.user);

    } else {

        res.status(401).json({
            error: 'Unauthorized'
        });
    }
});

// GET SENSOR DATA

app.get('/api/sensors', async (req, res) => {

    try {

        const data = await fs.readJson(sensorPath);

        res.json(data);

    } catch (error) {

        console.log(error);

        res.status(500).send('SERVER ERROR');
    }
});

// UPDATE LCD TEXT

app.post('/api/update-lcd', async (req, res) => {

    try {

        const { text } = req.body;

        if (!text) {
            return res.status(400).send('NO TEXT');
        }

        const finalText = text.substring(0, 16);

        await fs.writeFile(lcdPath, finalText);

        res.json({
            success: true,
            text: finalText
        });

    } catch (error) {

        console.log(error);

        res.status(500).send('SERVER ERROR');
    }
});

// DELETE RECORD

app.post('/api/delete-record', async (req, res) => {

    try {

        const { index } = req.body;

        let data = await fs.readJson(sensorPath);

        data.splice(index, 1);

        await fs.writeJson(sensorPath, data);

        res.json({
            success: true
        });

    } catch (error) {

        console.log(error);

        res.status(500).send('SERVER ERROR');
    }
});

// ======================
// DEVICE STATUS API
// ======================

app.get('/api/device-status', (req, res) => {

    try {

        if (!lastSeen) {

            return res.json({
                status: 'OFFLINE'
            });
        }

        const currentTime = new Date();

        const diff = (currentTime - lastSeen) / 1000;

        if (diff < 120) {

            res.json({
                status: 'ONLINE',
                lastSeen
            });

        } else {

            res.json({
                status: 'OFFLINE',
                lastSeen
            });
        }

    } catch (error) {

        console.log(error);

        res.status(500).send('SERVER ERROR');
    }
});

// ======================
// ESP8266 APIs
// ======================

// SAVE SENSOR DATA

app.all('/api/save-data', async (req, res) => {

    try {

        const key = req.query.key || req.body.key;

        if (key !== API_KEY) {

            return res.status(401).send('INVALID API KEY');
        }

        const temp = req.query.temp || req.body.temp;

        const hum = req.query.hum || req.body.hum;

        if (!temp || !hum) {

            return res.status(400).send('MISSING DATA');
        }

        if (isNaN(temp) || isNaN(hum)) {

            return res.status(400).send('INVALID SENSOR DATA');
        }

        const { time, date } = getKolkataTime();

        const data = await fs.readJson(sensorPath);

        // ADD NEW DATA AT TOP

        data.unshift({
            temp,
            hum,
            time,
            date
        });

        // KEEP ONLY 500 RECORDS

        if (data.length > 500) {
            data.pop();
        }

        await fs.writeJson(sensorPath, data);

        // UPDATE LAST SEEN

        lastSeen = new Date();

        console.log("NEW SENSOR DATA:", temp, hum);

        res.send('DATA SAVED');

    } catch (error) {

        console.log(error);

        res.status(500).send('SERVER ERROR');
    }
});

// GET LCD TEXT

app.get('/api/get-lcd', async (req, res) => {

    try {

        const text = await fs.readFile(lcdPath, 'utf8');

        res.send(text);

    } catch (error) {

        console.log(error);

        res.status(500).send('SERVER ERROR');
    }
});

// ======================
// WEATHER PREDICTION APIs (For Google Colab)
// ======================

// Save Prediction from Colab
app.post('/api/save-prediction', async (req, res) => {
    try {
        const { prediction, key } = req.body;
        if (key !== API_KEY) {
            return res.status(401).send('INVALID API KEY');
        }
        latestPrediction = prediction;
        console.log("AI Prediction Received from Colab:", prediction);
        res.json({ success: true });
    } catch (error) {
        console.log(error);
        res.status(500).send('SERVER ERROR');
    }
});

// Get Prediction for Dashboard
app.get('/api/get-prediction', (req, res) => {
    res.json({ prediction: latestPrediction });
});

// ======================
// DEFAULT ROUTE
// ======================

app.get('/', (req, res) => {

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======================
// SERVER START
// ======================

app.listen(PORT, () => {

    console.log(`
====================================
SISTec IoT Server Started
PORT: ${PORT}
====================================
    `);
});