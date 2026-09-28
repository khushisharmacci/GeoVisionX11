// Repository interface with Supabase Integration + In-Memory Fallback for GeoVision

import { Parcel, Building, Floor, Unit, VerticalParcel } from '../domain/types';
import { generateSeedData, SeedDataResult } from '../data/seed';

// Supabase is optional in this repository. Keep the fallback usable when the
// client package/configuration is not present in a given deployment.
const supabase: any = (globalThis as { supabase?: unknown }).supabase ?? {
  from: () => {
    throw new Error('Supabase client is unavailable');
  },
};

export interface CadastralRepository {
  getParcels(): Promise<Parcel[]>;
  getParcelById(id: string): Promise<Parcel | undefined>;
  getBuildings(parcelId?: string): Promise<Building[]>;
  getBuildingById(buildingId: string): Promise<Building | undefined>;
  getFloors(buildingId?: string): Promise<Floor[]>;
  getFloorById(floorId: string): Promise<Floor | undefined>;
  getUnits(floorId?: string): Promise<Unit[]>;
  getUnitById(unitId: string): Promise<Unit | undefined>;
  getUnitByUlpin3d(ulpin3d: string): Promise<Unit | undefined>;
  getVerticalParcels(): Promise<VerticalParcel[]>;
  saveUnit(unit: Unit): Promise<Unit>;
  updateUnitVerification(ulpin3d: string, status: Unit['verificationStatus'], approvedBy?: string): Promise<Unit>;
  addParcel(parcel: Parcel): Promise<Parcel>;
  addBuilding(building: Building): Promise<Building>;
  addDispute(unitId: string, disputeId: string): Promise<void>;
  resetToSeed(): void;
}

// In-Memory Repository Fallback (Used when Supabase is unreachable or empty)
class InMemoryCadastralRepository implements CadastralRepository {
  private data: SeedDataResult;

  constructor() {
    this.data = generateSeedData();
  }

  resetToSeed(): void {
    this.data = generateSeedData();
  }

  async getParcels(): Promise<Parcel[]> {
    return [...this.data.parcels];
  }

  async getParcelById(id: string): Promise<Parcel | undefined> {
    return this.data.parcels.find((p) => p.parcelId === id);
  }

  async getBuildings(parcelId?: string): Promise<Building[]> {
    if (parcelId) {
      return this.data.buildings.filter((b) => b.parcelId === parcelId);
    }
    return [...this.data.buildings];
  }

  async getBuildingById(buildingId: string): Promise<Building | undefined> {
    return this.data.buildings.find((b) => b.buildingId === buildingId);
  }

  async getFloors(buildingId?: string): Promise<Floor[]> {
    if (buildingId) {
      return this.data.floors.filter((f) => f.buildingId === buildingId);
    }
    return [...this.data.floors];
  }

  async getFloorById(floorId: string): Promise<Floor | undefined> {
    return this.data.floors.find((f) => f.floorId === floorId);
  }

  async getUnits(floorId?: string): Promise<Unit[]> {
    if (floorId) {
      return this.data.units.filter((u) => u.floorId === floorId);
    }
    return [...this.data.units];
  }

  async getUnitById(unitId: string): Promise<Unit | undefined> {
    return this.data.units.find((u) => u.unitId === unitId);
  }

  async getUnitByUlpin3d(ulpin3d: string): Promise<Unit | undefined> {
    return this.data.units.find((u) => u.ulpin3d.toLowerCase() === ulpin3d.toLowerCase().trim());
  }

  async getVerticalParcels(): Promise<VerticalParcel[]> {
    return [...this.data.verticalParcels];
  }

  async saveUnit(unit: Unit): Promise<Unit> {
    const idx = this.data.units.findIndex((u) => u.unitId === unit.unitId || u.ulpin3d === unit.ulpin3d);
    if (idx >= 0) {
      this.data.units[idx] = { ...unit };
    } else {
      this.data.units.push({ ...unit });
    }
    return { ...unit };
  }

  async updateUnitVerification(
    ulpin3d: string,
    status: Unit['verificationStatus'],
    approvedBy?: string
  ): Promise<Unit> {
    const unit = this.data.units.find((u) => u.ulpin3d === ulpin3d);
    if (!unit) {
      throw new Error(`Unit with 3D ULPIN ${ulpin3d} not found.`);
    }
    unit.verificationStatus = status;
    if (approvedBy) {
      unit.approvedBy = approvedBy;
    }
    return { ...unit };
  }

  async addParcel(parcel: Parcel): Promise<Parcel> {
    this.data.parcels.push(parcel);
    return parcel;
  }

  async addBuilding(building: Building): Promise<Building> {
    this.data.buildings.push(building);
    return building;
  }

  async addDispute(unitId: string, disputeId: string): Promise<void> {
    const unit = this.data.units.find((u) => u.unitId === unitId);
    if (unit) {
      if (!unit.disputeIds.includes(disputeId)) {
        unit.disputeIds.push(disputeId);
      }
    }
  }
}

// Supabase Production Repository with Fallback
class SupabaseCadastralRepository implements CadastralRepository {
  private fallbackRepo = new InMemoryCadastralRepository();

  resetToSeed(): void {
    this.fallbackRepo.resetToSeed();
  }

  async getParcels(): Promise<Parcel[]> {
    try {
      const { data, error } = await supabase.from('cadastre_parcel_2d').select('*');
      if (error || !data || data.length === 0) {
        return this.fallbackRepo.getParcels();
      }
      return data.map(mapDbRowToParcel);
    } catch {
      return this.fallbackRepo.getParcels();
    }
  }

  async getParcelById(id: string): Promise<Parcel | undefined> {
    try {
      const { data, error } = await supabase
        .from('cadastre_parcel_2d')
        .select('*')
        .eq('parcel_id', id)
        .maybeSingle();

      if (error || !data) {
        return this.fallbackRepo.getParcelById(id);
      }
      return mapDbRowToParcel(data);
    } catch {
      return this.fallbackRepo.getParcelById(id);
    }
  }

  async getBuildings(parcelId?: string): Promise<Building[]> {
    try {
      let query = supabase.from('cadastre_building_3d').select('*');
      if (parcelId) {
        query = query.eq('parcel_id', parcelId);
      }
      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return this.fallbackRepo.getBuildings(parcelId);
      }
      return data.map(mapDbRowToBuilding);
    } catch {
      return this.fallbackRepo.getBuildings(parcelId);
    }
  }

  async getBuildingById(buildingId: string): Promise<Building | undefined> {
    try {
      const { data, error } = await supabase
        .from('cadastre_building_3d')
        .select('*')
        .eq('building_id', buildingId)
        .maybeSingle();

      if (error || !data) {
        return this.fallbackRepo.getBuildingById(buildingId);
      }
      return mapDbRowToBuilding(data);
    } catch {
      return this.fallbackRepo.getBuildingById(buildingId);
    }
  }

  async getFloors(buildingId?: string): Promise<Floor[]> {
    try {
      let query = supabase.from('cadastre_floor_3d').select('*');
      if (buildingId) {
        query = query.eq('building_id', buildingId);
      }
      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return this.fallbackRepo.getFloors(buildingId);
      }
      return data.map(mapDbRowToFloor);
    } catch {
      return this.fallbackRepo.getFloors(buildingId);
    }
  }

  async getFloorById(floorId: string): Promise<Floor | undefined> {
    try {
      const { data, error } = await supabase
        .from('cadastre_floor_3d')
        .select('*')
        .eq('floor_id', floorId)
        .maybeSingle();

      if (error || !data) {
        return this.fallbackRepo.getFloorById(floorId);
      }
      return mapDbRowToFloor(data);
    } catch {
      return this.fallbackRepo.getFloorById(floorId);
    }
  }

  async getUnits(floorId?: string): Promise<Unit[]> {
    try {
      let query = supabase.from('cadastre_unit_3d').select('*');
      if (floorId) {
        query = query.eq('floor_id', floorId);
      }
      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return this.fallbackRepo.getUnits(floorId);
      }
      return data.map(mapDbRowToUnit);
    } catch {
      return this.fallbackRepo.getUnits(floorId);
    }
  }

  async getUnitById(unitId: string): Promise<Unit | undefined> {
    try {
      const { data, error } = await supabase
        .from('cadastre_unit_3d')
        .select('*')
        .eq('unit_id', unitId)
        .maybeSingle();

      if (error || !data) {
        return this.fallbackRepo.getUnitById(unitId);
      }
      return mapDbRowToUnit(data);
    } catch {
      return this.fallbackRepo.getUnitById(unitId);
    }
  }

  async getUnitByUlpin3d(ulpin3d: string): Promise<Unit | undefined> {
    try {
      const { data, error } = await supabase
        .from('cadastre_unit_3d')
        .select('*')
        .ilike('ulpin_3d', ulpin3d.trim())
        .maybeSingle();

      if (error || !data) {
        return this.fallbackRepo.getUnitByUlpin3d(ulpin3d);
      }
      return mapDbRowToUnit(data);
    } catch {
      return this.fallbackRepo.getUnitByUlpin3d(ulpin3d);
    }
  }

  async getVerticalParcels(): Promise<VerticalParcel[]> {
    return this.fallbackRepo.getVerticalParcels();
  }

  async saveUnit(unit: Unit): Promise<Unit> {
    try {
      const dbRow = mapUnitToDbRow(unit);
      const { data, error } = await supabase
        .from('cadastre_unit_3d')
        .upsert(dbRow)
        .select()
        .single();

      if (error || !data) {
        return this.fallbackRepo.saveUnit(unit);
      }
      return mapDbRowToUnit(data);
    } catch {
      return this.fallbackRepo.saveUnit(unit);
    }
  }

  async updateUnitVerification(
    ulpin3d: string,
    status: Unit['verificationStatus'],
    approvedBy?: string
  ): Promise<Unit> {
    try {
      const updates: any = { verification_status: status };
      if (approvedBy) updates.approved_by = approvedBy;

      const { data, error } = await supabase
        .from('cadastre_unit_3d')
        .update(updates)
        .ilike('ulpin_3d', ulpin3d.trim())
        .select()
        .single();

      if (error || !data) {
        return this.fallbackRepo.updateUnitVerification(ulpin3d, status, approvedBy);
      }
      return mapDbRowToUnit(data);
    } catch {
      return this.fallbackRepo.updateUnitVerification(ulpin3d, status, approvedBy);
    }
  }

  async addParcel(parcel: Parcel): Promise<Parcel> {
    try {
      const dbRow = mapParcelToDbRow(parcel);
      const { data, error } = await supabase
        .from('cadastre_parcel_2d')
        .insert(dbRow)
        .select()
        .single();

      if (error || !data) {
        return this.fallbackRepo.addParcel(parcel);
      }
      return mapDbRowToParcel(data);
    } catch {
      return this.fallbackRepo.addParcel(parcel);
    }
  }

  async addBuilding(building: Building): Promise<Building> {
    try {
      const dbRow = mapBuildingToDbRow(building);
      const { data, error } = await supabase
        .from('cadastre_building_3d')
        .insert(dbRow)
        .select()
        .single();

      if (error || !data) {
        return this.fallbackRepo.addBuilding(building);
      }
      return mapDbRowToBuilding(data);
    } catch {
      return this.fallbackRepo.addBuilding(building);
    }
  }

  async addDispute(unitId: string, disputeId: string): Promise<void> {
    try {
      const unit = await this.getUnitById(unitId);
      if (unit) {
        const disputeIds = unit.disputeIds || [];
        if (!disputeIds.includes(disputeId)) {
          disputeIds.push(disputeId);
          await supabase
            .from('cadastre_unit_3d')
            .update({ dispute_ids: disputeIds })
            .eq('unit_id', unitId);
        }
      }
    } catch (e) {
      console.warn('Supabase dispute sync error:', e);
    }
    await this.fallbackRepo.addDispute(unitId, disputeId);
  }
}

// Data Mappers (DB snake_case <-> TypeScript camelCase)
function mapDbRowToParcel(row: any): Parcel {
  return {
    parcelId: row.parcel_id,
    ulpin2d: row.ulpin_2d,
    surveyNumber: row.survey_number,
    state: row.state_code,
    city: row.city_code,
    district: row.district_name,
    areaSqm: Number(row.area_sqm),
    landUse: row.land_use,
    source: row.source_system,
    geometry: typeof row.boundary === 'string' ? JSON.parse(row.boundary) : row.boundary,
    bmcWard: row.bmc_ward,
    ctsNumber: row.cts_number,
    dilrmpRecordId: row.dilrmp_record_id,
    svamitvaPropertyId: row.svamitva_property_id,
    bhunakshaPlotNo: row.bhunaksha_plot_no,
    zoneCode: row.zone_code,
  };
}

function mapParcelToDbRow(parcel: Parcel): any {
  return {
    parcel_id: parcel.parcelId,
    ulpin_2d: parcel.ulpin2d,
    survey_number: parcel.surveyNumber,
    state_code: parcel.state,
    city_code: parcel.city,
    district_name: parcel.district,
    area_sqm: parcel.areaSqm,
    land_use: parcel.landUse,
    source_system: parcel.source,
    boundary: parcel.geometry,
    bmc_ward: parcel.bmcWard,
    cts_number: parcel.ctsNumber,
    dilrmp_record_id: parcel.dilrmpRecordId,
    svamitva_property_id: parcel.svamitvaPropertyId,
    bhunaksha_plot_no: parcel.bhunakshaPlotNo,
    zone_code: parcel.zoneCode,
  };
}

function mapDbRowToBuilding(row: any): Building {
  return {
    buildingId: row.building_id,
    parcelId: row.parcel_id,
    name: row.name,
    address: row.address,
    ulpin: row.ulpin,
    baseElevationM: Number(row.base_elevation_m),
    heightM: Number(row.height_m),
    floorsAbove: row.floors_above,
    floorsBelow: row.floors_below,
    yearBuilt: row.year_built,
    approvedFloors: row.approved_floors,
    extractionConfidence: Number(row.extraction_confidence),
    status: row.status,
    sourceAuthority: row.source_authority,
    bmcCtsNo: row.bmc_cts_no,
    bmcApprovalRef: row.bmc_approval_ref,
    dilrmp712No: row.dilrmp_712_no,
    svamitvaCardNo: row.svamitva_card_no,
    corsStationId: row.cors_station_id,
    gnssAccuracyM: row.gnss_accuracy_m,
    footprint: typeof row.footprint === 'string' ? JSON.parse(row.footprint) : row.footprint,
  };
}

function mapBuildingToDbRow(building: Building): any {
  return {
    building_id: building.buildingId,
    parcel_id: building.parcelId,
    name: building.name,
    address: building.address,
    ulpin: building.ulpin,
    base_elevation_m: building.baseElevationM,
    height_m: building.heightM,
    floors_above: building.floorsAbove,
    floors_below: building.floorsBelow,
    year_built: building.yearBuilt,
    approved_floors: building.approvedFloors,
    extraction_confidence: building.extractionConfidence,
    status: building.status,
    source_authority: building.sourceAuthority,
    bmc_cts_no: building.bmcCtsNo,
    bmc_approval_ref: building.bmcApprovalRef,
    dilrmp_712_no: building.dilrmp712No,
    svamitva_card_no: building.svamitvaCardNo,
    cors_station_id: building.corsStationId,
    gnss_accuracy_m: building.gnssAccuracyM,
    footprint: building.footprint,
  };
}

function mapDbRowToFloor(row: any): Floor {
  return {
    floorId: row.floor_id,
    buildingId: row.building_id,
    code: row.code,
    label: row.label,
    baseHeightM: Number(row.base_height_m),
    heightM: Number(row.height_m),
    areaSqm: Number(row.area_sqm),
    usage: row.usage,
    unitCount: row.unit_count,
    segmentationConfidence: Number(row.segmentation_confidence),
    ownershipStatus: row.ownership_status,
    disputeIds: row.dispute_ids || [],
  };
}

function mapDbRowToUnit(row: any): Unit {
  return {
    unitId: row.unit_id,
    floorId: row.floor_id,
    flatNumber: row.flat_number,
    ulpin3d: row.ulpin_3d,
    parentUlpin: row.parent_ulpin,
    ownerName: row.owner_name,
    ownerId: row.owner_id_masked,
    propertyType: row.property_type,
    builtUpAreaSqm: Number(row.built_up_area_sqm),
    carpetAreaSqm: Number(row.carpet_area_sqm),
    volumeM3: Number(row.volume_m3 || row.prism_volume_m3 || 0),
    parkingSlot: row.parking_slot,
    storage: row.storage_locker,
    taxStatus: row.tax_status,
    registrationDate: row.registration_date,
    verificationStatus: row.verification_status,
    approvedBy: row.approved_by,
    encumbranceStatus: row.encumbrance_status,
    topologyStatus: row.topology_status,
    coordinateSource: row.coordinate_source,
    disputeIds: row.dispute_ids || [],
  };
}

function mapUnitToDbRow(unit: Unit): any {
  return {
    ulpin_3d: unit.ulpin3d,
    unit_id: unit.unitId,
    floor_id: unit.floorId,
    flat_number: unit.flatNumber,
    parent_ulpin: unit.parentUlpin,
    owner_name: unit.ownerName,
    owner_id_masked: unit.ownerId,
    property_type: unit.propertyType,
    built_up_area_sqm: unit.builtUpAreaSqm,
    carpet_area_sqm: unit.carpetAreaSqm,
    volume_m3: unit.volumeM3 || 0,
    prism_volume_m3: unit.volumeM3 || 0,
    prism_min_height_m: unit.elevationRange?.minM || 0,
    prism_max_height_m: unit.elevationRange?.maxM || 0,
    parking_slot: unit.parkingSlot,
    storage_locker: unit.storage,
    tax_status: unit.taxStatus,
    registration_date: unit.registrationDate,
    verification_status: unit.verificationStatus,
    approved_by: unit.approvedBy,
    encumbrance_status: unit.encumbranceStatus || 'Clear',
    topology_status: unit.topologyStatus || 'Valid',
    coordinate_source: unit.coordinateSource,
    dispute_ids: unit.disputeIds || [],
    check_digits: unit.ulpin3d ? unit.ulpin3d.slice(-2) : '00',
  };
}

// Export Supabase Cadastral Repository as default repo instance
export const cadastralRepo: CadastralRepository = new SupabaseCadastralRepository();