import { familyMembers, replaceFamilyMembers } from '../utils/familyData'
import {
  fetchSnapshot, getActiveFamilyId, listFamilies, setActiveFamilyId,
  type FamilySnapshot, type FamilySummary,
} from './api'

let currentSnapshot: FamilySnapshot | null = null
let loadingPromise: Promise<FamilySnapshot | null> | null = null

export const getCurrentSnapshot = (): FamilySnapshot | null => currentSnapshot

export const ensureFamilyData = (force = false): Promise<FamilySnapshot | null> => {
  if (!force && currentSnapshot) return Promise.resolve(currentSnapshot)
  if (loadingPromise) return loadingPromise

  loadingPromise = listFamilies()
    .then(async families => {
      if (families.length === 0) {
        currentSnapshot = null
        replaceFamilyMembers([])
        return null
      }
      let familyId = getActiveFamilyId()
      if (!families.some(family => family.id === familyId)) {
        familyId = families[0].id
        setActiveFamilyId(familyId)
      }
      currentSnapshot = await fetchSnapshot(familyId)
      replaceFamilyMembers(currentSnapshot.members)
      return currentSnapshot
    })
    .finally(() => { loadingPromise = null })
  return loadingPromise
}

export const switchFamily = async (family: FamilySummary): Promise<void> => {
  setActiveFamilyId(family.id)
  currentSnapshot = null
  await ensureFamilyData(true)
}

export const invalidateFamilyData = (): void => {
  currentSnapshot = null
  familyMembers.splice(0, familyMembers.length)
}
