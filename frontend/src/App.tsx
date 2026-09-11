import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import UseCasesPage from './pages/UseCasesPage'
import UseCaseFormPage from './pages/UseCaseFormPage'
import DestinationsPage from './pages/DestinationsPage'
import DestinationFormPage from './pages/DestinationFormPage'
import SettingsPage from './pages/SettingsPage'
import LibraryCommunityPage from './pages/LibraryCommunityPage'
import LibraryObjectsPage from './pages/LibraryObjectsPage'
import LibraryVariablesPage from './pages/LibraryVariablesPage'
import LibraryPremiumPacksPage from './pages/LibraryPremiumPacksPage'
import LibrarySiemProfilesPage from './pages/LibrarySiemProfilesPage'
import MyObjectsPage from './pages/MyObjectsPage'
import MyObjectFormPage from './pages/MyObjectFormPage'
import MyVariablesPage from './pages/MyVariablesPage'
import MyVariableFormPage from './pages/MyVariableFormPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/use-cases" replace />} />
          <Route path="/use-cases" element={<UseCasesPage />} />
          <Route path="/use-cases/new" element={<UseCaseFormPage />} />
          <Route path="/use-cases/:id/edit" element={<UseCaseFormPage />} />
          <Route path="/destinations" element={<DestinationsPage />} />
          <Route path="/destinations/new" element={<DestinationFormPage />} />
          <Route path="/destinations/:id/edit" element={<DestinationFormPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/library/community" element={<LibraryCommunityPage />} />
          <Route path="/library/siem-profiles" element={<LibrarySiemProfilesPage />} />
          <Route path="/library/objects" element={<LibraryObjectsPage />} />
          <Route path="/library/variables" element={<LibraryVariablesPage />} />
          <Route path="/library/premium-packs" element={<LibraryPremiumPacksPage />} />
          <Route path="/my-objects" element={<MyObjectsPage />} />
          <Route path="/my-objects/new" element={<MyObjectFormPage />} />
          <Route path="/my-objects/:id/edit" element={<MyObjectFormPage />} />
          <Route path="/my-variables" element={<MyVariablesPage />} />
          <Route path="/my-variables/new" element={<MyVariableFormPage />} />
          <Route path="/my-variables/:id/edit" element={<MyVariableFormPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
