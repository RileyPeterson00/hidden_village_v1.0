/**
 * Unit tests: AssignContentModule — assign curriculum/games to classes.
 * Firebase, userDatabase, and database (curricular list) mocked.
 */
jest.mock('@inlet/react-pixi', () => {
  const React = require('react');
  const Text = ({ text }) => <span data-testid="pixi-text">{String(text ?? '')}</span>;
  const Graphics = () => null;
  const Stage = ({ children }) => <div>{children}</div>;
  const Container = ({ children }) => <div>{children}</div>;
  return {
    Text,
    Graphics,
    Stage,
    Container,
    PixiComponent: () => null,
    useApp: () => ({}),
    Sprite: () => null,
  };
});

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AssignContentModule from '../../../components/ClassManager/AssignContentModule.js';

jest.mock('../../../components/RectButton.js', () => {
  const React = require('react');
  return ({ text, callback }) => (
    <button type="button" data-testid={`btn-${String(text).replace(/\s+/g, '-').slice(0, 52)}`} onClick={callback}>
      {text}
    </button>
  );
});

jest.mock('../../../components/Background.js', () => () => null);

const mockGetCurrentUserContext = jest.fn();
const mockGetCurrentClassContext = jest.fn();
const mockGetClassesInOrg = jest.fn();
const mockGetUserClassesInOrg = jest.fn();
const mockGetClassInfo = jest.fn();
const mockAssignGamesToClasses = jest.fn();
const mockRemoveGameFromClass = jest.fn();
const mockGetCurricularListWithCurrentOrg = jest.fn();

jest.mock('../../../firebase/userDatabase.js', () => ({
  getCurrentUserContext: (...a) => mockGetCurrentUserContext(...a),
  getCurrentClassContext: (...a) => mockGetCurrentClassContext(...a),
  getClassesInOrg: (...a) => mockGetClassesInOrg(...a),
  getUserClassesInOrg: (...a) => mockGetUserClassesInOrg(...a),
  getClassInfo: (...a) => mockGetClassInfo(...a),
  assignGamesToClasses: (...a) => mockAssignGamesToClasses(...a),
  removeGameFromClass: (...a) => mockRemoveGameFromClass(...a),
}));

jest.mock('../../../firebase/database.js', () => ({
  getCurricularListWithCurrentOrg: (...a) => mockGetCurricularListWithCurrentOrg(...a),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: { uid: 'teacher-1', email: 't@school.edu' },
  })),
}));

const firebaseApp = {};
const sampleGames = [
  { UUID: 'g1', name: 'Game Alpha', _isFromOtherOrg: false },
  { UUID: 'g2', name: 'Game Beta', _isFromOtherOrg: false },
];

function setupTeacherMocks() {
  mockGetCurrentUserContext.mockResolvedValue({ orgId: 'org-1', role: 'Teacher' });
  mockGetCurrentClassContext.mockResolvedValue({ classId: 'class-a', className: 'Math' });
  mockGetUserClassesInOrg.mockResolvedValue({ 'class-a': true });
  mockGetClassInfo.mockImplementation(async (_org, classId) => {
    if (classId === 'class-a') {
      return { name: 'Math', assignedGames: {}, teachers: { 'teacher-1': {} } };
    }
    return { name: 'X', assignedGames: {}, teachers: {} };
  });
  mockGetCurricularListWithCurrentOrg.mockResolvedValue(sampleGames);
  mockAssignGamesToClasses.mockResolvedValue(undefined);
  mockRemoveGameFromClass.mockResolvedValue(undefined);
}

async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.getByTestId('btn-ASSIGN-GAMES')).toBeInTheDocument();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupTeacherMocks();
  window.alert = jest.fn();
  window.prompt = jest.fn();
});

describe('AssignContentModule', () => {
  test('loads curricular list via getCurricularListWithCurrentOrg(false, showPublic)', async () => {
    render(<AssignContentModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    expect(mockGetCurricularListWithCurrentOrg).toHaveBeenCalledWith(false, false);
  });

  test('main assign button is available after loading', async () => {
    render(<AssignContentModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();
    expect(screen.getByTestId('btn-ASSIGN-GAMES')).toBeInTheDocument();
  });

  test('alerts when assigning with no games selected', async () => {
    render(<AssignContentModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-ASSIGN-GAMES'));

    expect(window.alert).toHaveBeenCalledWith('Please select at least one game');
  });

  test('alerts when games selected but no class', async () => {
    render(<AssignContentModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-Game-Alpha'));
    fireEvent.click(screen.getByTestId('btn-ASSIGN-GAMES'));

    expect(window.alert).toHaveBeenCalledWith('Please select at least one class');
  });

  test('assignGamesToClasses called when game and class are selected', async () => {
    render(<AssignContentModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-Game-Alpha'));
    fireEvent.click(screen.getByTestId('btn-Math'));

    fireEvent.click(screen.getByTestId('btn-ASSIGN-GAMES'));

    await waitFor(() => {
      expect(mockAssignGamesToClasses).toHaveBeenCalledWith(
        'org-1',
        ['g1'],
        ['class-a'],
        'teacher-1',
        firebaseApp
      );
    });
  });

  test('selecting a class loads assigned games and calls getClassInfo and getCurricularListWithCurrentOrg for full list', async () => {
    mockGetClassInfo.mockImplementation(async (_org, classId) => {
      if (classId === 'class-a') {
        return {
          name: 'Math',
          assignedGames: { g1: true },
          teachers: { 'teacher-1': {} },
        };
      }
      return { name: 'X', assignedGames: {}, teachers: {} };
    });
    mockGetCurricularListWithCurrentOrg.mockImplementation(async (_final, includePublic) => {
      if (includePublic) return sampleGames;
      return sampleGames;
    });

    render(<AssignContentModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-Math'));

    await waitFor(() => {
      expect(mockGetClassInfo).toHaveBeenCalledWith('org-1', 'class-a', firebaseApp);
    });
    expect(mockGetCurricularListWithCurrentOrg).toHaveBeenCalledWith(false, true);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /✗.*Game Alpha/ })).toBeInTheDocument();
    });
  });

  test('removeGameFromClass called when removing assigned game from class', async () => {
    mockGetClassInfo.mockImplementation(async (_org, classId) => {
      if (classId === 'class-a') {
        return {
          name: 'Math',
          assignedGames: { g1: true },
          teachers: { 'teacher-1': {} },
        };
      }
      return { name: 'X', assignedGames: {}, teachers: {} };
    });
    mockGetCurricularListWithCurrentOrg.mockImplementation(async (_final, includePublic) => {
      if (includePublic) return sampleGames;
      return sampleGames;
    });

    render(<AssignContentModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-Math'));
    await waitFor(() => screen.getByRole('button', { name: /✗.*Game Alpha/ }));

    fireEvent.click(screen.getByRole('button', { name: /✗.*Game Alpha/ }));

    await waitFor(() => {
      expect(mockRemoveGameFromClass).toHaveBeenCalledWith('org-1', 'class-a', 'g1', firebaseApp);
    });
  });

  test('onBack is invoked from BACK button', async () => {
    const onBack = jest.fn();
    render(<AssignContentModule width={1000} height={700} firebaseApp={firebaseApp} onBack={onBack} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-BACK'));
    expect(onBack).toHaveBeenCalled();
  });
});
