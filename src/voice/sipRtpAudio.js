"use strict";
// RTP/AVP static payload type 0: G.711 mu-law, 8000 Hz, mono.
// Invoke only on an authenticated, admitted media channel. RTP alone is not authentication.
function decodePcmu(packet){
 if(!Buffer.isBuffer(packet)||packet.length<13||packet.length>1500||(packet[0]>>6)!==2||(packet[1]&127)!==0)return null;
 let offset=12+4*(packet[0]&15),end=packet.length;
 if(offset>end)return null;
 if(packet[0]&16){
  if(offset+4>end)return null;
  offset+=4+4*packet.readUInt16BE(offset+2);
 }
 if(packet[0]&32){const padding=packet[end-1];if(!padding||padding>end-offset)return null;end-=padding;}
 if(offset>=end||end-offset>960)return null;
 return {sequence:packet.readUInt16BE(2),timestamp:packet.readUInt32BE(4),ssrc:packet.readUInt32BE(8),audio:Buffer.from(packet.subarray(offset,end))};
}
function encodePcmu({sequence,timestamp,ssrc,audio}){
 if(!Buffer.isBuffer(audio)||audio.length<1||audio.length>960||
 !Number.isInteger(sequence)||sequence<0||sequence>65535||
 [timestamp,ssrc].some(x=>!Number.isInteger(x)||x<0||x>4294967295))throw Error("INVALID_RTP_FRAME");
 const packet=Buffer.alloc(12+audio.length);packet[0]=128;
 packet.writeUInt16BE(sequence,2);packet.writeUInt32BE(timestamp,4);packet.writeUInt32BE(ssrc,8);audio.copy(packet,12);return packet;
}
module.exports={decodePcmu,encodePcmu};
