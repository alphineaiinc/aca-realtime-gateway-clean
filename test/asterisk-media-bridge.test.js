"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{EventEmitter}=require("node:events");
const {attachAsteriskMedia}=require("../src/voice/asteriskMediaBridge");
test("admitted Asterisk media transports audio in both directions",()=>{
 const socket=new EventEmitter();socket.readyState=1;socket.bufferedAmount=0;
 let sent,received,closed=0;socket.send=(b,o)=>{assert.equal(o.binary,true);sent=b};socket.close=()=>{};
 const bridge=attachAsteriskMedia({socket,admitted:{tenantId:1},onAudio:b=>received=b,onClose:()=>closed++});
 const audio=Buffer.alloc(160,255),control=event=>socket.emit("message",Buffer.from(JSON.stringify(event)),false);
 assert.equal(bridge.sendAudio(audio),false);
 control({event:"MEDIA_START",format:"ulaw",optimal_frame_size:160});
 socket.emit("message",audio,true);assert.deepEqual(received,audio);
 assert.equal(bridge.sendAudio(audio),true);assert.deepEqual(sent,audio);
 control({event:"MEDIA_XOFF"});assert.equal(bridge.sendAudio(audio),false);
 control({event:"MEDIA_XON"});assert.equal(bridge.sendAudio(audio),true);
 socket.emit("message",Buffer.alloc(161),true);assert.equal(closed,1);
 assert.equal(bridge.sendAudio(audio),false);
});
