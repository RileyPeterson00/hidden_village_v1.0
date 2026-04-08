/**
 * Unit tests: AssignStudentsModule — assign / remove students, duplicate handling.
 * Firebase and userDatabase mocked.
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
import AssignStudentsModule from '../../../components/ClassManager/AssignStudentsModule.js';

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
const mockGetUsersByOrganizationFromDatabase = jest.fn();
const mockAssignStudentsToClasses = jest.fn();
const mockRemoveUserFromClass = jest.fn();

jest.mock('../../../firebase/userDatabase.js', () => ({
  getCurrentUserContext: (...a) => mockGetCurrentUserContext(...a),
  getCurrentClassContext: (...a) => mockGetCurrentClassContext(...a),
  getClassesInOrg: (...a) => mockGetClassesInOrg(...a),
  getUserClassesInOrg: (...a) => mockGetUserClassesInOrg(...a),
  getClassInfo: (...a) => mockGetClassInfo(...a),
  getUsersByOrganizationFromDatabase: (...a) => mockGetUsersByOrganizationFromDatabase(...a),
  assignStudentsToClasses: (...a) => mockAssignStudentsToClasses(...a),
  removeUserFromClass: (...a) => mockRemoveUserFromClass(...a),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: { uid: 'teacher-1', email: 't@school.edu' },
  })),
}));

const firebaseApp = {};
const defaultUsers = [
  { userId: 'u1', userName: 'Alice', userEmail: 'a@x.com', roleInOrg: 'Student' },
  { userId: 'u2', userName: 'Bob', userEmail: 'b@x.com', roleInOrg: 'Student' },
];

function setupTeacherMocks() {
  mockGetCurrentUserContext.mockResolvedValue({ orgId: 'org-1', role: 'Teacher' });
  mockGetCurrentClassContext.mockResolvedValue({ classId: 'class-a', className: 'Math' });
  mockGetUserClassesInOrg.mockResolvedValue({ 'class-a': true });
  mockGetClassInfo.mockImplementation(async (_org, classId) => {
    if (classId === 'class-a') {
      return { name: 'Math', students: {}, teachers: { 'teacher-1': {} } };
    }
    return { name: 'X', students: {}, teachers: {} };
  });
  mockGetUsersByOrganizationFromDatabase.mockResolvedValue(defaultUsers);
  mockAssignStudentsToClasses.mockResolvedValue(undefined);
  mockRemoveUserFromClass.mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupTeacherMocks();
  window.alert = jest.fn();
  window.prompt = jest.fn();
});

async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.getByTestId('btn-ASSIGN-USERS')).toBeInTheDocument();
  });
}

describe('AssignStudentsModule', () => {
  test('shows loading then ASSIGN USERS screen', async () => {
    render(<AssignStudentsModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitForLoaded();
  });

  test('alerts when ASSIGN USERS clicked with no user or class selection', async () => {
    render(<AssignStudentsModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-ASSIGN-USERS'));

    expect(window.alert).toHaveBeenCalledWith('Please select at least one user');
  });

  test('assignStudentsToClasses is called after selecting user and class', async () => {
    render(<AssignStudentsModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-Alice-(Student)'));
    fireEvent.click(screen.getByTestId('btn-Math'));

    fireEvent.click(screen.getByTestId('btn-ASSIGN-USERS'));

    await waitFor(() => {
      expect(mockAssignStudentsToClasses).toHaveBeenCalledWith(
        'org-1',
        ['u1'],
        ['class-a'],
        'teacher-1',
        firebaseApp
      );
    });
  });

  test('excludes already-assigned users from pick list (no duplicate enrollment in UI)', async () => {
    mockGetClassInfo.mockImplementation(async (_org, classId) => {
      if (classId === 'class-a') {
        return { name: 'Math', students: { u1: true }, teachers: { 'teacher-1': {} } };
      }
      return { name: 'X', students: {}, teachers: {} };
    });

    render(<AssignStudentsModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-Math'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /✗.*Alice/ })).toBeInTheDocument();
      expect(screen.getByTestId('btn-Bob-(Student)')).toBeInTheDocument();
    });
  });

  test('removeUserFromClass is called when removing assigned user', async () => {
    mockGetClassInfo.mockImplementation(async (_org, classId) => {
      if (classId === 'class-a') {
        return { name: 'Math', students: { u1: true }, teachers: { 'teacher-1': {} } };
      }
      return { name: 'X', students: {}, teachers: {} };
    });

    render(<AssignStudentsModule width={1000} height={700} firebaseApp={firebaseApp} onBack={jest.fn()} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-Math'));
    await waitFor(() => screen.getByRole('button', { name: /✗.*Alice/ }));

    fireEvent.click(screen.getByRole('button', { name: /✗.*Alice/ }));

    await waitFor(() => {
      expect(mockRemoveUserFromClass).toHaveBeenCalledWith('org-1', 'class-a', 'u1', firebaseApp);
    });
  });

  test('onBack callback runs when BACK is pressed', async () => {
    const onBack = jest.fn();
    render(<AssignStudentsModule width={1000} height={700} firebaseApp={firebaseApp} onBack={onBack} />);

    await waitForLoaded();

    fireEvent.click(screen.getByTestId('btn-BACK'));
    expect(onBack).toHaveBeenCalled();
  });
});
