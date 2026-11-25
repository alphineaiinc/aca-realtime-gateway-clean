"use strict";
// Internal transport, only attach after authenticated gateway admission.
// Asterisk JSON control mode, ulaw, 20 ms frames.
function attachAsteriskMedia({socket,admitted,onAudio,onClose}){
 if(!admitted||typeof onAudio!=="function"||typeof onClose!=="function")throw Error("ADMISSION_REQUIRED");
 let started=false,closed=false,paused=false;
 function stop(){if(closed)return;closed=true;socket.removeListener("message",receive);socket.removeListener("close",stop);socket.removeListener("error",stop);try{socket.close();}finally{onClose();}}
 function receive(data,binary){
  if(closed)return;
  try{
   if(!Buffer.isBuffer(data)||data.length>4096)return stop();
   if(binary){if(!started||data.length!==160)return stop();onAudio(Buffer.from(data));return;}
   const event=JSON.parse(data.toString("utf8"));
   if(event.event==="MEDIA_START"){
    if(started||event.format!=="ulaw"||event.optimal_frame_size!==160)return stop();
    started=true;
   }else if(started&&event.event==="MEDIA_XOFF")paused=true;
   else if(started&&event.event==="MEDIA_XON")paused=false;
  }catch{stop();}
 }
 socket.on("message",receive);socket.on("close",stop);socket.on("error",stop);
 return Object.freeze({sendAudio(audio){
  if(closed||!started||paused||socket.readyState!==1||socket.bufferedAmount>65536)return false;
  if(!Buffer.isBuffer(audio)||audio.length!==160)return false;
  socket.send(audio,{binary:true});return true;
 },close:stop});
}
module.exports={attachAsteriskMedia};
