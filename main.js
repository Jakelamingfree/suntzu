const roleHarvester = require('roles.harvester');
const roleBuilder = require('roles.builder');
const roleUpgrader = require('roles.upgrader');
const roleScout = require('roles.scout');
const roleRemoteHarvester = require('roles.remoteHarvester');
const roomManager = require('managers.roomManager');
const spawnManager = require('managers.spawnManager');

module.exports.loop = function () {
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    if (!Memory.rooms) Memory.rooms = {};

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.controller && room.controller.my) roomManager.run(room);
    }

    for (const spawnName in Game.spawns) {
        spawnManager.run(Game.spawns[spawnName]);
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const roles = {
            harvester: roleHarvester,
            builder: roleBuilder,
            upgrader: roleUpgrader,
            scout: roleScout,
            remoteHarvester: roleRemoteHarvester
        };
        const role = roles[creep.memory.role];
        if (role) role.run(creep);
    }

    if (Game.time % 10 === 0) {
        console.log(`Status - CPU: ${Game.cpu.getUsed().toFixed(2)}/${Game.cpu.limit}, Creeps: ${Object.keys(Game.creeps).length}`);
    }
};
