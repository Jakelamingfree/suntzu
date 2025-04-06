import "./types";

// Use consistent import style throughout
import { roleHarvester } from './roles/harvester';
import { roleBuilder } from './roles/builder';
import { roleUpgrader } from './roles/upgrader';
import { roleScout } from './roles/scout';
import { roleRemoteHarvester } from './roles/remoteHarvester';
import { roleHauler } from './roles/hauler';
import { roleMiner } from './roles/miner';
import { roomManager } from './managers/roomManager';
import { spawnManager } from './managers/spawnManager';

// Move roles outside the loop for performance
const roles: { [role: string]: CreepRole } = {
    harvester: roleHarvester,
    builder: roleBuilder,
    upgrader: roleUpgrader,
    scout: roleScout,
    remoteHarvester: roleRemoteHarvester,
    hauler: roleHauler,
    miner: roleMiner
};

export function loop(): void {
    // Clean up memory for non-existing creeps
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    // Initialize rooms memory if needed
    if (!Memory.rooms) Memory.rooms = {};

    // Process owned rooms
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.controller && room.controller.my) roomManager.run(room);
    }

    // Process spawns
    for (const spawnName in Game.spawns) {
        spawnManager.run(Game.spawns[spawnName]);
    }

    // Process creeps
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const role = roles[creep.memory.role];
        if (role) role.run(creep);
    }

    // Log status periodically
    if (Game.time % 10 === 0) {
        console.log(`Status - CPU: ${Game.cpu.getUsed().toFixed(2)}/${Game.cpu.limit}, Creeps: ${Object.keys(Game.creeps).length}`);
    }
}
