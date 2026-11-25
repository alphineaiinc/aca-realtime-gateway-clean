'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {admit}=require('../.github/scripts/stage2-admission');
const base={event:'schedule',ref:'refs/heads/main',attempt:'1',repository:'alphineaiinc/aca-realtime-gateway-clean',approved:'a'.repeat(40),config:'a'.repeat(40),enabled:'true',now:1000,expires:2000};
test('only bounded approved scheduled tick admitted',()=>{assert.equal(admit(base),true);for(const patch of [{event:'push'},{ref:'refs/heads/other'},{attempt:'2'},{repository:'other/repo'},{approved:''},{config:'bad'},{enabled:'false'},{expires:1000},{expires:86401001},{now:NaN}])assert.equal(admit({...base,...patch}),false);assert.equal(admit(),false);});
