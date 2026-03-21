import { create } from 'zustand'

type WorkspaceState = {
  jobsDrawerOpen: boolean
  setJobsDrawerOpen: (open: boolean) => void
  toggleJobsDrawer: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  jobsDrawerOpen: false,
  setJobsDrawerOpen: (jobsDrawerOpen) => set({ jobsDrawerOpen }),
  toggleJobsDrawer: () => set((state) => ({ jobsDrawerOpen: !state.jobsDrawerOpen })),
}))
