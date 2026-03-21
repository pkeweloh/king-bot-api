import { tribe, hero_status, time_type, time_format, celebration_types, oasis_type } from './data';

export interface Ifarmlist {
	listId: number;
	listName: string;
	lastSent: number;
	lastChanged: Date;
	units: Ifarmlist_units;
	orderNr: number;
	villageIds: number[];
	entryIds: number[];
	isDefault: boolean;
	maxEntriesCount: number;
}

export interface Ifarmlist_entry {
	entryId: number;
	villageId: number;
	villageName: string;
	units: Ifarmlist_units;
	targetOwnerId: number;
	belongsToKing: number;
	population: number;
	coords: Icoordinates;
	isOasis: boolean;
	lastReport: {
		time: number;
		notificationType: number;
		raidedResSum: number;
		capacity: number;
		reportId: string;
	};
}

export interface Ifarmlist_units {
	[index: number]: number
	1: number;
	2: number;
	3: number;
	4: number;
	5: number;
	6: number;
}

export interface Ifarmfinder {
	villageId: number,
	village_name: string,
	x: number,
	y: number,
	population: number,
	isMainVillage: boolean,
	isCity: boolean,
	playerId: number,
	player_name: string,
	tribeId: tribe | null,
	kingdomId: number,
	kingdom_tag: string,
	distance: number
}

export interface Icropfinder {
	id: number,
	x: number,
	y: number,
	crop_type: string,
	bonus: number,
	playerId: number,
	player_name: string,
	distance: number,
	free: boolean
}

export interface Iresourcefinder {
	id: number,
	x: number,
	y: number,
	res_type: string,
	bonus: number,
	playerId: number,
	player_name: string,
	distance: number,
	free: boolean
}

export interface Inaturefinder {
	id: number,
	x: number,
	y: number,
	oasis_type: oasis_type,
	nature: Iunits,
	distance: number
}

export interface Iunits {
	[index: number]: number
	1: number;
	2: number;
	3: number;
	4: number;
	5: number;
	6: number;
	7: number;
	8: number;
	9: number;
	10: number;
	11: number;
}

export interface Icoordinates {
	[index: string]: number
	x: number;
	y: number;
}

export interface Ivillage {
	villageId: number;
	playerId: number;
	name: string;
	tribeId: tribe;
	belongsToKing: number;
	belongsToKingdom: number;
	type: number;
	population: number;
	coordinates: Icoordinates;
	isMainVillage: boolean;
	isTown: boolean;
	treasuresUseable: number;
	treasures: number;
	protectionGranted: number;
	tributeCollectorPlayerId: number;
	realTributePercent: number;
	// from here only returned for own village
	supplyBuildings: number;
	supplyTroops: number;
	production: Iresources;
	storage: Iresources;
	treasury: Iresources;
	storageCapacity: Iresources;
	usedControlPoints: number;
	availableControlPoints: number;
	culturePoints: number;
	celebrationType: number;
	celebrationEnd: number;
	culturePointProduction: number;
	treasureResourceBonus: number;
	acceptance: number;
	acceptanceProduction: number;
	tributes: Iresources;
	tributesCapacity: number;
	tributeTreasures: number;
	tributeProduction: number;
	tributeProductionWithCrop: number;
	tributeProductionDetail: Iresources;
	tributeTime: number;
	tributesRequiredToFetch: number;
	estimatedWarehouseLevel: number;
	allowTributeCollection: number;
	// only robbers (?)
	position: number;
}

export interface Ibuilding_collection {
	name: string
	data: Ibuilding
}

export interface Ibuilding {
	buildingType: number
	villageId: number
	locationId: number
	lvl: number
	lvlNext: number
	isMaxLvl: boolean
	lvlMax: number
	upgradeCosts: Iresources
	nextUpgradeCosts: { [index: number]: Iresources }
	upgradeTime: number
	nextUpgradeTimes: { [index: number]: number }
	upgradeSupplyUsage: number
	upgradeSupplyUsageSums: { [index: number]: number }
	category: number
	sortOrder: number
	rubble: Iresources
	rubbleDismantleTime: number
	effect: number[]
}

export interface Ibuilding_queue {
	villageId: number
	tribeId: tribe
	freeSlots: {
		[index: number]: number
		1: number // buildings
		2: number // resources
		4: number
	}
	queues: {
		[index: number]: any[]
		1: any[] // buildings
		2: any[] // resources
		4: any[]
		5: any[]
	}
	canUseInstantConstruction: boolean
	canUseInstantConstructionOnlyInVillage: boolean
}

export interface Iresources {
	[index: number]: number
	1: number
	2: number
	3: number
	4: number
}

export interface Ihero {
	playerId: number;
	villageId: number;
	destVillageId: number;
	destVillageName: string;
	destPlayerName: string;
	destPlayerId: number;
	status: hero_status;
	health: number;
	lastHealthTime: number;
	baseRegenerationRate: number;
	regenerationRate: number;
	fightStrength: number;
	fightStrengthPoints: number;
	attBonusPoints: number;
	defBonusPoints: number;
	resBonusPoints: number;
	resBonusType: number;
	freePoints: number;
	speed: number;
	untilTime: number;
	bonuses: any;
	maxScrollsPerDay: number;
	scrollsUsedToday: number;
	waterbucketUsedToday: number;
	ointmentsUsedToday: number;
	adventurePointCardUsedToday: number;
	resourceChestsUsedToday: number;
	cropChestsUsedToday: number;
	artworkUsedToday: number;
	isMoving: boolean;
	adventurePoints: number;
	adventurePointTime: number;
	levelUp: number;
	xp: number;
	xpThisLevel: number;
	xpNextLevel: number;
	level: number;
}

export interface Ihero_item_collection {
	name: string
	data: Ihero_item
}

export interface Ihero_item {
	id: number,
	playerId: number,
	tribeId: tribe,
	inSlot: number,
	itemId: number,
	itemType: number,
	amount: number,
	strength: number,
	images: string[],
	bonuses: [],
	stackable: boolean,
	slot: number,
	lastChange: number,
	hasSpeedBonus: boolean,
	inventorySlotNr: number,
	previousOwners: number,
	upgradeLevel: number,
	upgradableItemType: boolean,
	itemQuality: number,
	itemTier: number,
	baseUpgradeBonus: [],
	cardGameItem: boolean,
	premiumItem: boolean,
	upgradedItem: boolean
}

export interface Iplayer {
	playerId: number,
	name: string,
	tribeId: tribe,
	kingdomId: number,
	kingdomTag: string,
	kingdomRole: number,
	isKing: boolean,
	kingId: number,
	kingstatus: number,
	villages: Ivillage[],
	population: number,
	active: boolean,
	prestige: number,
	level: number,
	stars: {
		bronzeBadge:number,
		bronze: number,
		silver: number,
		gold: number
	},
	nextLevelPrestige: number,
	hasNoobProtection: boolean,
	filterInformation: boolean,
	signupTime: number,
	vacationState: number,
	uiLimitations: number,
	gold: number,
	silver: number,
	deletionTime: number,
	coronationDuration: number,
	brewCelebration: number,
	uiStatus: number,
	hintStatus: number,
	spawnedOnMap: number,
	isActivated: boolean,
	isInstant: boolean,
	productionBonusTime: number,
	cropProductionBonusTime: number,
	premiumFeatureAutoExtendFlags: number,
	plusAccountTime: number,
	limitedPremiumFeatureFlags: number,
	lastPaymentTime: number,
	isPunished: boolean,
	limitationFlags: number,
	limitation: number,
	isBannedFromMessaging: boolean,
	bannedFromMessaging: number,
	questVersion: number,
	nextDailyQuestTime: number,
	dailyQuestsExchanged: number,
	avatarIdentifier: number,
	vacationStateStart: number,
	vacationStateEnd: number,
	usedVacationDays: number,
	halloweenBoostTime: number,
	winterPackageBoughtAmount: number,
	springDealBoughtAmount: number
}

export interface Itarget {
	srcVillageId: number,
	srcVillageName: string,
	srcVillageTribe: tribe,
	srcVillageType: number,
	srcPlayerId: number,
	srcPlayerName: string,
	villageId: number,
	villageName: string,
	villageTribe: tribe,
	villageType: number,
	destPlayerId: number,
	destPlayerName: string,
	isOasis: number,
	isGovernorNPCVillage: boolean,
	isRobberVillage: boolean,
	isWorldWonderVillage: boolean,
	durations: Idurations,
	distance: number,
	ownVillage: boolean,
	warning: []
}

export interface Idurations {
	[index: number]: number
	1: number,
	2: number,
	3: number,
	4: number,
	5: number,
	6: number,
	7: number,
	8: number,
	9: number,
	10: number,
	11: number,
	101: number,
	102: number,
	103: number,
	104: number,
	105: number,
	106: number,
	107: number,
	108: number,
	109: number,
	110: number,
	111: number
}

export interface Imap_details {
	isOasis: boolean,
	oasisType: oasis_type,
	hasVillage: number,
	hasNPC: number,
	resType: number,
	isHabitable: number,
	landscape: number,
	oasisBonus: Iresources,
	troops: Itroops,
	playerId: number,
	playerName: string,
	kingdomId: number,
	kingdomTag: string,
	ownKingdomInfluence: number,
	defBonus: number,
	ownRank: number,
	playersWithTroops: Iplayers_with_troops[]
	oasisStatus: number,
	ownTroops: Iown_troops,
	population: number,
	tribe: tribe,
	treasures: 0
	npcInfo: Inpc_info,
	wwZone: number
}

export interface Iplayers_with_troops {
	playerId: number,
	bonus: number
}

export interface Iown_troops {
	id: number,
	oasisId: number,
	oasisType: oasis_type,
	playerId: number,
	rank: number,
	amount: number,
	maxUsableTroops: number,
	usedByVillage: number,
	villageInfluence: number,
	bonus: Iresources,
	troopProduction: number
}

export interface Inpc_info {
	villageId: number,
	name: string,
	type: number,
	playerId: number,
	tribeId: number,
	loot: Iresources,
	treasures: number,
	troops: Itroops
}

export interface Itroops_collection {
	name: string
	data: Itroops
}

export interface Itroops {
	troopId: number,
	tribeId: number,
	playerId: number,
	playerName: string,
	villageId: number,
	villageName: string,
	villageIdLocation: number,
	villageNameLocation: string,
	playerIdLocation: number,
	playerNameLocation: string,
	filter: string,
	villageIdSupply: number,
	status: string,
	units: Iunits,
	supplyTroops: number,
	capacity: number,
	movement: Imovement
}

export interface Imovement {
	troopId: number,
	villageIdStart: number,
	villageIdTarget: number,
	playerIdTarget: number,
	coordinateID: number,
	timeStart: number,
	timeFinish: number,
	movementType: number,
	resources: Iresources,
	treasures: number,
	spyTarget: number,
	catapultTarget1: number,
	catapultTarget2: number,
	orderId: number,
	merchants: number
}

export interface Isettings {
	playerId: number,
	premiumConfirmation: number,
	lang: string,
	onlineStatusFilter: number,
	extendedSimulator: number,
	musicVolume: number,
	soundVolume: number,
	uiSoundVolume: number,
	muteAll: boolean,
	timeType: time_type,
	timeZone: number,
	timeZoneString: string,
	timeZoneSwitcher:number,
	timeFormat: time_format,
	attacksFilter: number,
	mapFilter: number,
	disableTabNotifications: number,
	enableTabNotifications: boolean,
	disableAnimations: boolean,
	notpadsVisible: boolean,
	disableHelpNotifications: true,
	enableHelpNotifications: boolean,
	enableWelcomeScreen: boolean,
	showPopulationWarning: boolean,
	showSeasonalTheme: boolean,
	showSnowfall: boolean
}

export interface Iresearch {
	researchQueueFull: boolean
	upgradeQueueFull: boolean
	units: Iresearch_unit[]
}

export interface Iresearch_unit {
	unitType: number
	unitLevel: number
	costs: Iresources
	time: number
	canResearch: boolean
	canUpgrade: boolean
	unitsInUpgrade: number
	required: Iresearch_required[]
	maxLevel: number
	currentStrength: Iresearch_strength
	researchStrength: Iresearch_strength[]
}

export interface Iresearch_queue {
	villageId: number
	buildingTypes: Iresearch_queue_building
}

export interface Iresearch_queue_building {
	[index: number]: Iresearch_queue_unit[]
}

export interface Iresearch_queue_unit {
	unitType: number,
	researchLevel: number
	startTime: number
	finished: number
	pause: number
}

export interface Iresearch_required {
	buildingType: number
	requiredLevel: number
	currentLevel: number
	valid: boolean
}

export interface Iresearch_strength {
	level: number
	attack: number
	defence: number
	defenceCavalry: number
}

export interface Icelebration_queue {
	queues: {
		[index: number]: any[]
		24: Icelebration_queue_item[] // town hall
		35: Icelebration_queue_item[] // brewery
	}
	lastFinished: {
		[index: number]: number
		24: number // town hall
		35: number // brewery
	}
}

export interface Icelebration_queue_item {
	id: number
	type: celebration_types
	endTime: number
	culturePoints: number
}

export interface Icelebration {
	costs: Iresources,
	type: celebration_types,
	duration: number
	culturePoints: string
	maxCount: number
}

export interface Imap_village_tile {
	x: number
	y: number
	locationId: number
	villageId: number
	type?: string
}

export interface Imap_region_tile {
	id: number
	locationId: number
	x: number
	y: number
	playerId: number | null
	villageId: number | null
	hasVillage: boolean
	type: string | null
	resType: string | null
	landscape: string | null
	owner: number | null
	village?: any
	oasis?: any
	[key: string]: any
}

export interface Iregion {
	rx: number;
	ry: number;
}

export interface Itile {
	locationId: number;
	x: number;
	y: number;
}

export interface Iregion_bounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export interface Imap_snapshot {
	players: Imap_player_snapshot[];
}

export interface Imap_player_snapshot {
	playerId: number;
	name: string | null;
	tribeId: tribe | null;
	kingdomId: number | null;
	villages: Imap_village_snapshot[];
}

export interface Imap_village_snapshot {
	villageId: number;
	name: string | null;
	x: number;
	y: number;
	population: number | null;
	isMainVillage: boolean;
	isCity: boolean;
}

export interface Iplayer_match {
	recent: Imap_player_snapshot;
	aged: Imap_player_snapshot;
}
