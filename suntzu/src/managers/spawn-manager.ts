import "../types";

export const spawnManager: SpawnManagerType = {
    run(spawn: StructureSpawn): void {
        if (spawn.spawning) return;

        const room = spawn.room;
        const counts = this.countCreepsByRole();

        const nextRole = this.getNextCreepRole(counts, room);

        if (nextRole) {
            const body = this.getCreepBody(nextRole, room.energyAvailable);
            const name = `${nextRole.charAt(0).toUpperCase() + nextRole.slice(1)}${Game.time}`;

            const result = spawn.spawnCreep(body, name, {
                memory: { role: nextRole }
            });

            if (result === OK) {
                console.log(`Spawning new ${nextRole}: ${name}`);
            }
        }
    },

    countCreepsByRole(): { [role: string]: number } {
        let counts = {
            harvester: 0,
            upgrader: 0,
            builder: 0,
            scout: 0,
            remoteHarvester: 0,
            hauler: 0,
            miner: 0
        };

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (counts[creep.memory.role] !== undefined) counts[creep.memory.role]++;
        }

        return counts;
    },

    getNextCreepRole(counts: { [role: string]: number }, room: Room): string | null {
        // Always prioritize minimum number of harvesters
        if (counts.harvester < 2) return 'harvester';
        
        // Add haulers once we have basic harvesters
        // Determine if we have containers built
        const containers = room.find(FIND_STRUCTURES, {
            filter: (s: Structure) => s.structureType === STRUCTURE_CONTAINER
        });
        
        // If we have containers, prefer miners over harvesters
        if (containers.length > 0) {
            const sources = room.find(FIND_SOURCES);
            if (counts.miner < sources.length) return 'miner';
            
            // If we have miners for all sources, make sure we have haulers
            if (counts.hauler < Math.min(2, containers.length)) {
                return 'hauler';
            }
        }
        
        if (room.memory.needsExploration && counts.scout < 1) return 'scout';

        let remoteSourcesAvailable = 0;
        for (const roomName in Memory.rooms) {
            if (roomName === room.name) continue;
            const mem = Memory.rooms[roomName];
            if (mem.sources && mem.sources.length && !mem.hostilePresence) {
                remoteSourcesAvailable += mem.sources.length;
            }
        }

        if (remoteSourcesAvailable > counts.remoteHarvester && counts.remoteHarvester < 4) return 'remoteHarvester';
        if (counts.upgrader < 1) return 'upgrader';

        const sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length && counts.builder < 2) return 'builder';
        if (counts.upgrader < 3) return 'upgrader';
        if (remoteSourcesAvailable > counts.remoteHarvester && counts.remoteHarvester < 8) return 'remoteHarvester';
        
        // Scale up haulers if we have more remote harvesters
        if (counts.remoteHarvester > 2 && counts.hauler < Math.ceil(counts.remoteHarvester / 2) + 1) {
            return 'hauler';
        }

        return null;
    },

    getCreepBody(role: string, energy: number): BodyPartConstant[] {
        if (energy < 300) return [WORK, CARRY, MOVE];

        switch (role) {
            case 'harvester':
                if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
                if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
                return [WORK, WORK, CARRY, MOVE];

            case 'upgrader':
                if (energy >= 550) return [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE];
                if (energy >= 400) return [WORK, WORK, WORK, CARRY, MOVE];
                return [WORK, WORK, CARRY, MOVE];

            case 'builder':
                if (energy >= 550) return [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
                if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
                return [WORK, WORK, CARRY, MOVE];

            case 'scout':
                return energy >= 300 ? [MOVE, MOVE, MOVE] : [MOVE, MOVE];

            case 'remoteHarvester':
                if (energy >= 650) return [WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
                if (energy >= 500) return [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
                if (energy >= 350) return [WORK, CARRY, CARRY, MOVE, MOVE];
                return [WORK, CARRY, MOVE, MOVE];
                
            case 'hauler':
                if (energy >= 800) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
                if (energy >= 550) return [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE];
                if (energy >= 400) return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
                return [CARRY, CARRY, MOVE, MOVE];
                
            case 'miner':
                if (energy >= 750) return [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE];
                if (energy >= 550) return [WORK, WORK, WORK, WORK, CARRY, MOVE];
                if (energy >= 400) return [WORK, WORK, WORK, CARRY, MOVE];
                return [WORK, WORK, CARRY, MOVE];

            default:
                return [WORK, CARRY, MOVE];
        }
    }
};
