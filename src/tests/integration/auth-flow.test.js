/**
 * Integration Tests: Auth to Game Flow
 *
 * Covers the connection between the auth system and the game/dashboard entry
 * point (Story.js):
 *   - Unauthenticated users are redirected to /signin
 *   - Authenticated users see a loading state while data fetches
 *   - Auth state is restored on mount (session persistence)
 *   - Student role leads to the game entry view (Home / PlayMenu)
 *   - Teacher role leads to the teacher dashboard view (PlayMenu with Teacher role)
 *   - Missing org/role triggers the OrganizationSelector gate
 *
 * Story.js drives all of these flows. It uses PixiJS (Home, PlayMenu,
 * OrganizationSelector) which cannot render in jsdom. These components are
 * replaced with minimal stubs so the auth logic under test can run.
 *
 * Firebase Auth and userDatabase are mocked throughout.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Story from '../../components/Story';

// Story.js imports `app` from firebase/init - stub it so no real SDK init occurs
jest.mock('../../firebase/init', () => ({ app: {} }));

// Mock user data fetchers called after successful auth
const mockGetUserNameFromDatabase = jest.fn();
const mockGetCurrentUserContext = jest.fn();
const mockGetCurrentUserOrgInfo = jest.fn();
jest.mock('../../firebase/userDatabase', () => ({
  getUserNameFromDatabase: (...args) => mockGetUserNameFromDatabase(...args),
  getCurrentUserContext: (...args) => mockGetCurrentUserContext(...args),
  getCurrentUserOrgInfo: (...args) => mockGetCurrentUserOrgInfo(...args),
}));

// Stub PixiJS-heavy components with DOM elements that carry test ids/attributes
jest.mock('../../components/utilities/Loader.js', () => {
  const React = require('react');
  return function MockLoader() {
    return React.createElement('div', { 'data-testid': 'loader' }, 'Loading...');
  };
});

jest.mock('../../components/Home.js', () => {
  const React = require('react');
  return function MockHome({ startCallback }) {
    return React.createElement(
      'div',
      { 'data-testid': 'home' },
      React.createElement('button', { 'data-testid': 'home-start', onClick: startCallback }, 'Start'),
    );
  };
});

jest.mock('../../components/PlayMenu/PlayMenu.js', () => {
  const React = require('react');
  return function MockPlayMenu({ role }) {
    return React.createElement('div', { 'data-testid': 'play-menu', 'data-role': role });
  };
});

jest.mock('../../components/OrganizationSelector.js', () => {
  const React = require('react');
  return function MockOrgSelector() {
    return React.createElement('div', { 'data-testid': 'org-selector' });
  };
});

// Get the auto-mocked onAuthStateChanged so individual tests can override it
const { onAuthStateChanged } = require('firebase/auth');
const FIXTURE_USER = { uid: '12345', email: 'testuser@example.com', displayName: 'Test User' };

// jsdom's window.location is non-configurable and cannot be replaced or spied
// upon directly (see SignIn.test.js for the same constraint). The redirect
// triggered by Story.js fires a jsdom "not implemented: navigation" console.error.
// Tests that exercise the unauthenticated path suppress that noise via a spy.
beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks wipes the implementation set in __mocks__/firebase/auth.js,
  // so restore the default authenticated behaviour here.
  onAuthStateChanged.mockImplementation((_auth, callback) => {
    callback(FIXTURE_USER);
    return jest.fn();
  });
  // Suppress React's "not wrapped in act()" warning. This fires when async
  // state updates (setUserName/Role/Org) resolve after waitFor completes —
  // a known React 16/17 testing quirk that does not affect test correctness.
  // All other errors and warnings are left visible.
  jest.spyOn(console, 'error').mockImplementation((msg, ...args) => {
    if (typeof msg === 'string' && msg.includes('not wrapped in act')) return;
    // eslint-disable-next-line no-console
    console.error.mock.original?.(msg, ...args);
  });
});

// ============================================================
// Helpers
// ============================================================

const makeStudentContext = () => ({
  role: 'Student',
  orgId: 'org-1',
  orgName: 'Test Org',
});

const makeTeacherContext = () => ({
  role: 'Teacher',
  orgId: 'org-1',
  orgName: 'Test Org',
});

const setupUserMocks = ({ name = 'testuser', context = makeStudentContext() } = {}) => {
  mockGetUserNameFromDatabase.mockResolvedValue(name);
  mockGetCurrentUserContext.mockResolvedValue(context);
  mockGetCurrentUserOrgInfo.mockResolvedValue({ orgName: context.orgName });
};

// ============================================================
// Unauthenticated user
// ============================================================

describe('Unauthenticated user', () => {
  test('blocks app content and redirects when no session exists', () => {
    // jsdom cannot execute navigation, so we suppress the expected console.error
    // and verify the auth gate behavour: no app content shown.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null);
      return jest.fn();
    });

    render(<Story />);

    // isAuthenticated is never set when user is null; loading gate stays locked
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByTestId('home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('play-menu')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});

// ============================================================
// Authenticated user - loading state
// ============================================================

describe('Authenticated user - loading state', () => {
  test('shows Loader while user data is still being fetched', () => {
    // Promises that never resolve simulate an in-flight fetch
    mockGetUserNameFromDatabase.mockReturnValue(new Promise(() => {}));
    mockGetCurrentUserContext.mockReturnValue(new Promise(() => {}));
    mockGetCurrentUserOrgInfo.mockReturnValue(new Promise(() => {}));

    render(<Story />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  test('checks auth state on mount without any user interaction (session persistence)', () => {
    setupUserMocks();

    render(<Story />);

    // onAuthStateChanged is called immediately on mount - no button clicks required
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
  });

  test('fetches user data automatically once auth is confirmed', async () => {
    setupUserMocks();

    render(<Story />);

    await waitFor(() => {
      expect(mockGetUserNameFromDatabase).toHaveBeenCalled();
      expect(mockGetCurrentUserContext).toHaveBeenCalled();
      expect(mockGetCurrentUserOrgInfo).toHaveBeenCalled();
    });
  });
});

// ============================================================
// Student sign-in
// ============================================================

describe('Student sign-in', () => {
  test('Loader disappears and Home (game entry) shown after data loads', async () => {
    setupUserMocks({ context: makeStudentContext() });

    render(<Story />);

    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  test('PlayMenu receives Student role when student starts the game', async () => {
    setupUserMocks({ context: makeStudentContext() });

    render(<Story />);

    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-start'));

    await waitFor(() => {
      expect(screen.getByTestId('play-menu')).toBeInTheDocument();
    });
    expect(screen.getByTestId('play-menu')).toHaveAttribute('data-role', 'Student');
  });
});

// ============================================================
// Teacher sign-in
// ============================================================

describe('Teacher sign-in', () => {
  test('PlayMenu receives Teacher role when teacher starts the game', async () => {
    setupUserMocks({ name: 'teacher_user', context: makeTeacherContext() });

    render(<Story />);

    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-start'));

    await waitFor(() => {
      expect(screen.getByTestId('play-menu')).toBeInTheDocument();
    });
    expect(screen.getByTestId('play-menu')).toHaveAttribute('data-role', 'Teacher');
  });

  test('OrganizationSelector is not shown when teacher has a valid role and org', async () => {
    setupUserMocks({ name: 'teacher_user', context: makeTeacherContext() });

    render(<Story />);

    await waitFor(() => {
      expect(screen.queryByTestId('org-selector')).not.toBeInTheDocument();
    });
  });
});

// ============================================================
// Missing organization / role
// ============================================================

describe('Missing organization or role', () => {
  test('OrganizationSelector shown when user has no assigned role or org', async () => {
    mockGetUserNameFromDatabase.mockResolvedValue('new_user');
    mockGetCurrentUserContext.mockResolvedValue({ role: null, orgId: null, orgName: null });
    mockGetCurrentUserOrgInfo.mockResolvedValue({ orgName: null });

    render(<Story />);

    await waitFor(() => {
      expect(screen.getByTestId('org-selector')).toBeInTheDocument();
    });
  });
});
