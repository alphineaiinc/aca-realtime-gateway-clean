"use strict";
function elevenLabsRequest(voiceId,format){
 if(typeof voiceId!=="string"||! /^[A-Za-z0-9_-]{1,128}$/.test(voiceId))throw Error("INVALID_ELEVENLABS_VOICE");
 if(format!=="ulaw_8000"&&format!=="mp3_44100_128")throw Error("INVALID_ELEVENLABS_FORMAT");
 return {url:"/v1/text-to-speech/"+voiceId,options:{baseURL:"https://api.elevenlabs.io",allowAbsoluteUrls:false,maxRedirects:0,params:{output_format:format}}};
}
module.exports={elevenLabsRequest};
