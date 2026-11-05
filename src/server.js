import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {db} from './db.js';
import {initializeDatabase} from './init-db.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
const app=express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin:process.env.CORS_ORIGIN?.split(',') || false}));
app.use(express.json({limit:'32kb'}));
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false}));
app.get('/health',async(req,res)=>{try{await db.query('SELECT 1');res.json({status:'ok',database:'connected'});}catch{res.status(503).json({status:'unavailable'});}});
const loginSchema=z.object({email:z.string().email().max(254),password:z.string().min(1)});
app.post('/api/auth/login',async(req,res)=>{
 const parsed=loginSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Invalid input'});
 try{
  const [rows]=await db.execute('SELECT id,email,password_hash,role,is_active FROM admins WHERE email=? LIMIT 1',[parsed.data.email.toLowerCase()]);
  const admin=rows[0];
  if(!admin || !admin.is_active || !(await bcrypt.compare(parsed.data.password,admin.password_hash)))return res.status(401).json({error:'Invalid credentials'});
  // This token is a bootstrap development token. Add MFA before production.
  const token=jwt.sign({sub:String(admin.id),role:admin.role},process.env.JWT_SECRET,{expiresIn:'30m',issuer:'fijas-de-elite'});
  res.json({token,admin:{id:admin.id,email:admin.email,role:admin.role},mfaRequiredForProduction:true});
 }catch(e){console.error('login error',e.message);res.status(500).json({error:'Internal error'});}
});
function authenticate(req,res,next){const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)return res.status(401).json({error:'Unauthorized'});try{req.auth=jwt.verify(token,process.env.JWT_SECRET,{issuer:'fijas-de-elite'});next();}catch{return res.status(401).json({error:'Unauthorized'});}}
app.get('/api/admin/me',authenticate,async(req,res)=>{const [rows]=await db.execute('SELECT id,email,role,is_active FROM admins WHERE id=?',[req.auth.sub]);if(!rows[0]?.is_active)return res.status(403).json({error:'Forbidden'});res.json(rows[0]);});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Internal error'});});
const port=Number(process.env.PORT||3000);
try {
 await initializeDatabase();
 app.listen(port,'0.0.0.0',()=>console.log(`Fijas de Elite API listening on ${port}`));
} catch (error) {
 console.error('Database initialization failed:', error);
 process.exitCode = 1;
 await db.end();
}
