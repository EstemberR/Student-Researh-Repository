import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from 'dotenv';
import './firebaseAdminConfig.js';
import authRoutes from '../routes/authRoutes.js'; 
import bodyParser from 'body-parser';
import User from '../model/user.js';

dotenv.config(); 
const app = express();
const PORT = process.env.PORT || 8000; 

app.use(cors({
    origin: 'http://localhost:3000', 
    method: "POST",
    credentials: true,
}));    
app.use(express.json()); 
app.use(bodyParser.json());

app.locals.userModel = User;

const connect = async () => {
    try {
        await mongoose.connect("mongodb+srv://user99:FnF2PQSvSZGBHW8c@cluster0.qpda5.mongodb.net/Student_RepoDB?retryWrites=true&w=majority&appName=Cluster0", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MONGODB');
    } catch (error) {
        console.error('Error connecting to MONGODB:', error);
    }
};

mongoose.connection.on('disconnected', () => {
    console.log('Disconnected from MONGODB');
});
//google auth
app.use('/api/auth', authRoutes);
//manual login
app.use('/api', authRoutes);
app.listen(PORT, () => {
    connect(); 
    console.log(`Listening on PORT ${PORT}`);
});