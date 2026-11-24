import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 team:{type:mongoose.Schema.Types.ObjectId,ref:'Team',required:true,index:true},
 project:{type:mongoose.Schema.Types.ObjectId,ref:'Project'},
 repository:{type:mongoose.Schema.Types.ObjectId,ref:'Repository',required:true,index:true},
 path:{type:String,required:true,maxlength:1200},bytes:{type:Number,min:0},sha:String,
 language:String,isTest:Boolean,isDocumentation:Boolean,folder:String,
 lastCommitAt:Date,commitCount90d:Number,healthScore:Number,
 flags:[String],assessment:{type:mongoose.Schema.Types.Mixed,default:{}},syncedAt:Date
},{timestamps:true});
schema.index({team:1,repository:1,path:1},{unique:true});
export default mongoose.model('FileMetric',schema);
