import mongoose from "mongoose";
const invitationSchema=new mongoose.Schema({team:{type:mongoose.Schema.Types.ObjectId,ref:'Team',required:true},email:{type:String,required:true,lowercase:true},role:{type:String,enum:['manager','team_leader','developer','designer','viewer'],default:'developer'},tokenHash:{type:String,required:true,index:true},expiresAt:{type:Date,required:true},createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},createdAt:{type:Date,default:Date.now}});
export default mongoose.model('Invitation',invitationSchema);
