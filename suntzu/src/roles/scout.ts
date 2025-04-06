import "../types";
import { roomUtils } from '../utils/roomUtils';

export const roleScout: CreepRole = {
    run(creep: Creep): void {
        if (!creep.memory.exploring) {
            creep.memory.exploring = true;
            creep.memory.homeRoom = creep.room.name;
            this.findNewRoomToExplore(creep);
        }

        if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
            const exit = creep.pos.findClosestByPath(exitDir);
            if (exit) {
                creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
        } else if (creep.memory.targetRoom && creep.room.name === creep.memory.targetRoom) {
            roomUtils.updateRoomMemory(creep.room);

            if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
                creep.memory.targetRoom = creep.memory.homeRoom;
            } else {
                this.findNewRoomToExplore(creep);
            }
        }
    },

    findNewRoomToExplore(creep: Creep): void {
        const exits = Game.map.describeExits(creep.room.name);
        const roomMemory = Memory.rooms || {};
        let candidates: { name: string, lastVisit: number }[] = [];

        for (const exitDir in exits) {
            const roomName = exits[exitDir];
            const lastVisit = roomMemory[roomName]?.lastVisit || 0;
            if (Game.time - lastVisit > 1000) {
                candidates.push({ name: roomName, lastVisit });
            }
        }

        candidates.sort((a, b) => a.lastVisit - b.lastVisit);

        if (candidates.length > 0) {
            creep.memory.targetRoom = candidates[0].name;
        } else {
            const exitDirs = Object.keys(exits);
            if (exitDirs.length > 0) {
                const randomDir = exitDirs[Math.floor(Math.random() * exitDirs.length)];
                creep.memory.targetRoom = exits[randomDir];
            }
        }
    }
};
