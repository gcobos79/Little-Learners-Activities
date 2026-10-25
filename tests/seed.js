// Seed data in the exact V121 format
const now=new Date().toISOString();
const opt=(text,correct,extra={})=>({id:'o'+Math.random().toString(36).slice(2),text,readTextEnabled:false,readText:'',audioMode:'voice',image:'',audio:'',correct,...extra});
const q=(text,opts,extra={})=>({id:'q'+Math.random().toString(36).slice(2),text,readTextEnabled:false,readText:'',audioMode:'voice',emoji:'',image:'',audio:'',correctCount:1,options:opts,...extra});
module.exports={
 folders:[{id:'folder-1',name:'Español',parentId:null,color:'#F6D6D6'},{id:'folder-2',name:'Matemáticas',parentId:null,color:'#CFE8F7'},{id:'folder-3',name:'Letras',parentId:'folder-1',color:'#F8EDB8'},{id:'folder-4',name:'Borradores',parentId:null,color:'#E7E9ED'}],
 library:[
  {id:'quiz-a',familyId:'quiz-a',type:'quiz',name:'Animales',version:1,folderId:'folder-1',config:{lang:'es',mode:'practice',questionOrder:'fixed',answerOrder:'fixed',visibility:'visible',coverImage:'',questions:[q('¿Cuál es el perro?',[opt('🐶',true),opt('🐱',false),opt('🐸',false),opt('🦆',false)]),q('¿Cuál empieza con M?',[opt('mono',true),opt('sol',false),opt('pato',false)])]},createdAt:now,updatedAt:now},
  {id:'quiz-b',familyId:'quiz-b',type:'quiz',name:'Vocales',version:1,folderId:'folder-3',config:{lang:'es',mode:'assessment',questionOrder:'random',answerOrder:'random',visibility:'visible',coverImage:'',questions:[q('Toca la A',[opt('A',true),opt('E',false),opt('I',false),opt('O',false),opt('U',false)])]},createdAt:now,updatedAt:now},
  {id:'quiz-c',familyId:'quiz-c',type:'quiz',name:'Contar hasta 5',version:1,folderId:'folder-2',config:{lang:'es',mode:'practice',questionOrder:'fixed',answerOrder:'fixed',visibility:'hidden',coverImage:'',questions:[q('¿Cuántas manzanas? 🍎🍎🍎',[opt('3',true),opt('2',false)])]},createdAt:now,updatedAt:now},
  {id:'quiz-d',familyId:'quiz-d',type:'quiz',name:'Colores',version:1,config:{lang:'en',mode:'practice',questionOrder:'fixed',answerOrder:'fixed',visibility:'visible',coverImage:'',questions:[q('Which one is red?',[opt('🍎',true),opt('🍌',false),opt('🫐',false),opt('🥦',false),opt('🍊',false),opt('🍇',false)])]},createdAt:now,updatedAt:now},
  {id:'act-old',familyId:'act-old',type:'quick_sort',name:'Letras M y P',version:1,config:{lang:'es',per:4,speed:45,mode:'practice',letters:['M','P'],red:true,yellow:false,green:false,auto:true},createdAt:now,updatedAt:now}
 ]};
