'use strict';
const definitions = [
 ['project-manager','plan','requirements, priorities, acceptance criteria and dependencies'],
 ['solution-architect','design','architecture, interfaces, data boundaries and constraints'],
 ['backend-developer','backend-proposal','bounded backend implementation proposal'],
 ['frontend-developer','frontend-proposal','bounded UI implementation proposal and accessibility'],
 ['qa-testing','test-report','independent tests and regression evidence'],
 ['security-reviewer','security-report','independent security findings and disposition proposal'],
 ['devops','operations-report','CI, observability and rollback readiness proposal'],
 ['orchestrator','coordinate','workflow sequencing and dependency coordination']
];
const roles = Object.freeze(Object.fromEntries(definitions.map(([id,action,mission])=>[id,Object.freeze({id,action,mission})])));
function getRole(id){if(typeof id!=='string'||!Object.hasOwn(roles,id))throw Error('Unknown role');return roles[id];}
module.exports={roles,getRole};
