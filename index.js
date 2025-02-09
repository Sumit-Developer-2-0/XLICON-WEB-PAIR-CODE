const express = require('express');
const app = express();
const path = require('path'); // Import the path module
const bodyParser = require("body-parser");
const helmet = require('helmet');
// const cors = require('cors'); // If you need CORS
const PORT = process.env.PORT || 8000;

let code = require('./pair');
require('events').EventEmitter.defaultMaxListeners = 500;

// Middleware
app.use(helmet()); // Add security headers
// app.use(cors());  // Enable CORS if needed
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/code', code);

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Routes
app.get('/pair', (req, res) => {
    res.sendFile('pair.html', { root: path.join(__dirname, 'public') });
});

app.get('/', (req, res) => {
    res.sendFile('main.html', { root: path.join(__dirname, 'public') });
});

// Error handling middleware (must be defined after all routes)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`YoutTube: S4 Salman YT\nTelegram: ahmmitech\nGitHub: @salmanytofficial\nInstsgram: ahmmikun\n\nServer running on http://localhost:${PORT}`);
});

module.exports = app;
