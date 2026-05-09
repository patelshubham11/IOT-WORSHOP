const express = require('express');
const session = require('express-session');
const fs = require('fs-extra');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({
    secret: 'sistec-iot-secret-2026',
    resave: false,
    saveUninitialized: true
}));

// Paths
const dataDir = path.join(__dirname, 'data');
const usersPath = path.join(dataDir, 'users.json');
const sensorPath = path.join(dataDir, 'sensor_data.json');
const lcdPath = path.join(dataDir, 'lcd.txt');

// Ensure files exist
async function initDB() {
    await fs.ensureDir(dataDir);
    if (!(await fs.pathExists(usersPath))) await fs.writeJson(usersPath, []);
    if (!(await fs.pathExists(sensorPath))) await fs.writeJson(sensorPath, []);
    if (!(await fs.pathExists(lcdPath))) await fs.writeFile(lcdPath, 'SISTec IoT 2026');
}
initDB();

// Helper to get Kolkata Time
function getKolkataTime() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
    const date = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    return { time, date };
}

// --- AUTH ROUTES ---

app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    const users = await fs.readJson(usersPath);
    if (users.find(u => u.email === email)) return res.send('User already exists. <a href="/register.html">Try again</a>');
    users.push({ name, email, password });
    await fs.writeJson(usersPath, users);
    res.redirect('/');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const users = await fs.readJson(usersPath);
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        req.session.user = user;
        res.redirect('/dashboard.html');
    } else {
        res.send('Invalid Credentials. <a href="/">Back to Login</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- API FOR WEB UI ---

app.get('/api/user', (req, res) => {
    if (req.session.user) res.json(req.session.user);
    else res.status(401).json({ error: 'Unauthorized' });
});

app.get('/api/sensors', async (req, res) => {
    const data = await fs.readJson(sensorPath);
    res.json(data);
});

app.post('/api/update-lcd', async (req, res) => {
    const { text } = req.body;
    if (text) {
        await fs.writeFile(lcdPath, text.substring(0, 16));
        res.json({ success: true });
    } else res.status(400).send('No text');
});

app.post('/api/delete-record', async (req, res) => {
    const { index } = req.body;
    let data = await fs.readJson(sensorPath);
    data.splice(index, 1);
    await fs.writeJson(sensorPath, data);
    res.json({ success: true });
});

// --- API FOR ESP8266 ---

// Save Temp & Humidity (Supports both GET and POST for ease of ESP)
app.all('/api/save-data', async (req, res) => {
    const temp = req.query.temp || req.body.temp;
    const hum = req.query.hum || req.body.hum;

    if (temp && hum) {
        const { time, date } = getKolkataTime();
        const data = await fs.readJson(sensorPath);
        data.unshift({ temp, hum, time, date }); // Add to beginning
        await fs.writeJson(sensorPath, data);
        res.send('DATA SAVED');
    } else {
        res.status(400).send('MISSING DATA');
    }
});

// Get LCD Text
app.get('/api/get-lcd', async (req, res) => {
    const text = await fs.readFile(lcdPath, 'utf8');
    res.send(text);
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
