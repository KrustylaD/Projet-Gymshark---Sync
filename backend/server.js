const express = require('express');

const app = express();
const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.use(express.json());

// Import routes
const chatRoutes = require('./routes/chat');

// Use routes
app.use(chatRoutes);
