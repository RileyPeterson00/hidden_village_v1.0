import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Story from '../../../components/Story';

const mockSend = jest.fn();
let mockMachineStateValue = 'loading';
let mockAuthUser = null;

const mockGetAuth = jest.fn(() => ({ currentUser: mockAuthUser }));
const mockSignOut = jest.fn(() => Promise.resolve());
const mockOnAuthStateChanged = jest.fn((_auth, callback) => {
  callback(mockAuthUser);
  return jest.fn();
});

const mockGetUserNameFromDatabase = jest.fn();
const mockGetCurrentUserContext = jest.fn();
const mockGetCurrentUserOrgInfo = jest.fn();

jest.mock('@xstate/react', () => ({
  useMachine: () => [{ value: mockMachineStateValue }, mockSend],
}));

jest.mock('firebase/auth', () => ({
  getAuth: (...args) => mockGetAuth(...args),
  signOut: (...args) => mockSignOut(...args),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
}));

jest.mock('../../../firebase/init', () => ({
  app: {},
}));

jest.mock('../../../firebase/userDatabase', () => ({
  getUserNameFromDatabase: (...args) => mockGetUserNameFromDatabase(...args),
  getCurrentUserContext: (...args) => mockGetCurrentUserContext(...args),
  getCurrentUserOrgInfo: (...args) => mockGetCurrentUserOrgInfo(...args),
}));

jest.mock('../../../components/utilities/Loader.js', () => () => <div data-testid="loader">Loading</div>);
jest.mock('../../../components/Home.js', () => ({ startCallback, logoutCallback, userName }) => (
  <div>
    <span data-testid="home">Home for {userName}</span>
    <button type="button" onClick={startCallback}>
      Start
    </button>
    <button type="button" onClick={logoutCallback}>
      Logout
    </button>
  </div>
));
jest.mock('../../../components/OrganizationSelector.js', () => () => (
  <div data-testid="organization-selector">OrganizationSelector</div>
));
jest.mock('../../../components/PlayMenu/PlayMenu.js', () => ({ role, organization }) => (
  <div data-testid="play-menu">
    PlayMenu {role} {organization}
  </div>
));

describe('Story component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMachineStateValue = 'loading';
    mockAuthUser = null;
    mockGetUserNameFromDatabase.mockResolvedValue('Teacher Name');
    mockGetCurrentUserContext.mockResolvedValue({ role: 'Teacher' });
    mockGetCurrentUserOrgInfo.mockResolvedValue({ orgName: 'Org One' });
  });

  test('keeps loading and does not request user data when auth user is missing', async () => {
    render(<Story />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGetUserNameFromDatabase).not.toHaveBeenCalled();
      expect(mockGetCurrentUserContext).not.toHaveBeenCalled();
      expect(mockGetCurrentUserOrgInfo).not.toHaveBeenCalled();
    });
  });

  test('renders organization selector when user is authenticated but role/org is incomplete', async () => {
    mockAuthUser = { uid: 'u-1' };
    mockGetCurrentUserContext.mockResolvedValue({ role: null });
    mockGetCurrentUserOrgInfo.mockResolvedValue({ orgName: null });

    render(<Story />);

    await waitFor(() => {
      expect(screen.getByTestId('organization-selector')).toBeInTheDocument();
    });
  });

  test('sends TOGGLE in loading state when auth and user context are ready', async () => {
    mockAuthUser = { uid: 'u-1' };
    mockMachineStateValue = 'loading';

    render(<Story />);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith('TOGGLE');
    });
  });

  test('renders Home in ready state and supports start + logout callbacks', async () => {
    mockAuthUser = { uid: 'u-1' };
    mockMachineStateValue = 'ready';

    render(<Story />);

    await waitFor(() => {
      expect(screen.getByTestId('home')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(mockSend).toHaveBeenCalledWith('TOGGLE');

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(mockSignOut).toHaveBeenCalled();
  });

  test('renders PlayMenu in main state and refreshes user data after userContextChanged event', async () => {
    mockAuthUser = { uid: 'u-1' };
    mockMachineStateValue = 'main';

    render(<Story />);

    await waitFor(() => {
      expect(screen.getByTestId('play-menu')).toBeInTheDocument();
    });

    const baselineCalls = mockGetUserNameFromDatabase.mock.calls.length;
    window.dispatchEvent(new Event('userContextChanged'));

    await waitFor(() => {
      expect(mockGetUserNameFromDatabase.mock.calls.length).toBeGreaterThan(
        baselineCalls
      );
      expect(mockGetCurrentUserContext.mock.calls.length).toBeGreaterThan(1);
      expect(mockGetCurrentUserOrgInfo.mock.calls.length).toBeGreaterThan(1);
    });
  });
});
