/**
 * Unit tests: ClassManager + ClassObject (teacher-facing class management).
 * Firebase / userDatabase fully mocked.
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
import ClassManager from '../../../components/ClassManager/ClassManager.js';
import ClassObject from '../../../components/ClassManager/ClassObject.js';

jest.mock('../../../components/RectButton.js', () => {
  const React = require('react');
  return ({ text, callback }) => (
    <button type="button" data-testid={`btn-${String(text).replace(/\s+/g, '-').slice(0, 48)}`} onClick={callback}>
      {text}
    </button>
  );
});

jest.mock('../../../components/Background.js', () => () => null);

jest.mock('../../../components/ClassManager/AssignContentModule.js', () => {
  const React = require('react');
  return () => <div data-testid="assign-content-mock">AssignContent</div>;
});

jest.mock('../../../components/ClassManager/AssignStudentsModule.js', () => {
  const React = require('react');
  return () => <div data-testid="assign-students-mock">AssignStudents</div>;
});

jest.mock('../../../components/ClassManager/ClassList.js', () => {
  const React = require('react');
  return ({ classes, onDelete, onSwitch }) => (
    <div data-testid="class-list">
      {classes.map((c) => (
        <div key={c.id}>
          <button
            type="button"
            data-testid={`switch-row-${c.id}`}
            onClick={() => onSwitch(c.id)}
          >
            Switch {c.name}
          </button>
          <button
            type="button"
            data-testid={`delete-row-${c.id}`}
            onClick={() => onDelete(c)}
          >
            Delete {c.name}
          </button>
        </div>
      ))}
    </div>
  );
});

const mockGetCurrentUserContext = jest.fn();
const mockGetCurrentClassContext = jest.fn();
const mockGetClassesInOrg = jest.fn();
const mockGetUserClassesInOrg = jest.fn();
const mockGetClassInfo = jest.fn();
const mockEnsureDefaultClass = jest.fn();
const mockCreateClass = jest.fn();
const mockDeleteClass = jest.fn();
const mockSwitchUserClass = jest.fn();
const mockRefreshUserContext = jest.fn();

jest.mock('../../../firebase/userDatabase.js', () => ({
  getCurrentUserContext: (...a) => mockGetCurrentUserContext(...a),
  getCurrentClassContext: (...a) => mockGetCurrentClassContext(...a),
  getClassesInOrg: (...a) => mockGetClassesInOrg(...a),
  getUserClassesInOrg: (...a) => mockGetUserClassesInOrg(...a),
  getClassInfo: (...a) => mockGetClassInfo(...a),
  ensureDefaultClass: (...a) => mockEnsureDefaultClass(...a),
  createClass: (...a) => mockCreateClass(...a),
  deleteClass: (...a) => mockDeleteClass(...a),
  switchUserClass: (...a) => mockSwitchUserClass(...a),
  refreshUserContext: (...a) => mockRefreshUserContext(...a),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: { uid: 'teacher-uid-1', email: 'teacher@test.com' },
  })),
}));

const firebaseApp = {};

const adminSetup = () => {
  mockGetCurrentUserContext.mockResolvedValue({ orgId: 'org-1', role: 'Admin' });
  mockGetCurrentClassContext.mockResolvedValue({ classId: 'c1', className: 'My Class' });
  mockEnsureDefaultClass.mockResolvedValue(undefined);
  mockGetClassesInOrg.mockResolvedValue({
    c1: { name: 'My Class', isDefault: false, students: {}, teachers: { 'teacher-uid-1': {} } },
  });
  mockGetUserClassesInOrg.mockResolvedValue({});
  mockGetClassInfo.mockResolvedValue({ name: 'X', students: {}, teachers: {} });
};

const teacherSetup = () => {
  mockGetCurrentUserContext.mockResolvedValue({ orgId: 'org-1', role: 'Teacher' });
  mockGetCurrentClassContext.mockResolvedValue({ classId: 't1', className: 'Period 1' });
  mockEnsureDefaultClass.mockResolvedValue(undefined);
  mockGetUserClassesInOrg.mockResolvedValue({ t1: true });
  mockGetClassInfo.mockImplementation(async (_org, classId) => {
    if (classId === 't1') {
      return { name: 'Period 1', students: {}, teachers: { 'teacher-uid-1': {} }, isDefault: false };
    }
    return { name: 'Other', students: {}, teachers: {}, isDefault: false };
  });
};

const studentSetup = () => {
  mockGetCurrentUserContext.mockResolvedValue({ orgId: 'org-1', role: 'Student' });
  mockGetCurrentClassContext.mockResolvedValue({ classId: 's1', className: 'Homeroom' });
  mockEnsureDefaultClass.mockResolvedValue(undefined);
  mockGetUserClassesInOrg.mockResolvedValue({ s1: true });
  mockGetClassInfo.mockImplementation(async (_org, classId) => {
    if (classId === 's1') {
      return { name: 'Homeroom', students: { stu1: true }, teachers: {} };
    }
    return { name: 'X', students: {}, teachers: {} };
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateClass.mockResolvedValue(undefined);
  mockDeleteClass.mockResolvedValue(undefined);
  mockSwitchUserClass.mockResolvedValue(undefined);
  mockRefreshUserContext.mockResolvedValue(undefined);
  window.alert = jest.fn();
  window.confirm = jest.fn();
  window.prompt = jest.fn();
});

describe('ClassManager', () => {
  test('shows loading then main management UI for Admin', async () => {
    adminSetup();

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    expect(screen.getByText('Loading classes...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('CLASS MANAGEMENT')).toBeInTheDocument();
    });

    expect(mockEnsureDefaultClass).toHaveBeenCalledWith('org-1', firebaseApp);
    expect(mockGetClassesInOrg).toHaveBeenCalledWith('org-1', firebaseApp);
  });

  test('createClass is called with trimmed name when CREATE CLASS succeeds', async () => {
    adminSetup();
    window.prompt.mockReturnValue('  New Period  ');

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('btn-CREATE-CLASS'));

    await waitFor(() => {
      expect(mockCreateClass).toHaveBeenCalledWith(
        'org-1',
        'New Period',
        'teacher-uid-1',
        firebaseApp
      );
    });
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('created successfully'));
  });

  test('createClass is not called when prompt is cancelled or whitespace-only', async () => {
    adminSetup();
    window.prompt.mockReturnValue(null);

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('btn-CREATE-CLASS'));
    expect(mockCreateClass).not.toHaveBeenCalled();

    window.prompt.mockReturnValue('   ');
    fireEvent.click(screen.getByTestId('btn-CREATE-CLASS'));
    expect(mockCreateClass).not.toHaveBeenCalled();
  });

  test('deleteClass is not called for default class; user is alerted', async () => {
    adminSetup();
    mockGetClassesInOrg.mockResolvedValue({
      def1: { id: 'def1', name: 'Default Class', isDefault: true, students: {}, teachers: {} },
    });

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('delete-row-def1'));

    expect(window.alert).toHaveBeenCalledWith('Cannot delete Default Class');
    expect(mockDeleteClass).not.toHaveBeenCalled();
  });

  test('deleteClass runs after confirm for non-default class', async () => {
    adminSetup();
    window.confirm.mockReturnValue(true);

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('delete-row-c1'));

    await waitFor(() => {
      expect(mockDeleteClass).toHaveBeenCalledWith('org-1', 'c1', firebaseApp);
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  test('opens assign content view when ASSIGN GAMES is clicked', async () => {
    adminSetup();

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('btn-ASSIGN-GAMES'));
    expect(screen.getByTestId('assign-content-mock')).toBeInTheDocument();
  });

  test('opens assign students view when ASSIGN USERS is clicked', async () => {
    adminSetup();

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('btn-ASSIGN-USERS'));
    expect(screen.getByTestId('assign-students-mock')).toBeInTheDocument();
  });

  test('Teacher role loads classes via getUserClassesInOrg and getClassInfo', async () => {
    teacherSetup();

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    expect(mockGetUserClassesInOrg).toHaveBeenCalledWith('teacher-uid-1', 'org-1', firebaseApp);
    expect(mockGetClassInfo).toHaveBeenCalledWith('org-1', 't1', firebaseApp);
  });

  test('Teacher cannot delete a class they do not teach', async () => {
    teacherSetup();
    mockGetClassesInOrg.mockResolvedValue({});
    mockGetClassInfo.mockImplementation(async () => ({
      id: 'other',
      name: 'Not Mine',
      isDefault: false,
      students: {},
      teachers: { 'someone-else': {} },
    }));
    mockGetUserClassesInOrg.mockResolvedValue({ other: true });

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('delete-row-other'));

    expect(window.alert).toHaveBeenCalledWith('You can only delete classes where you are a teacher');
    expect(mockDeleteClass).not.toHaveBeenCalled();
  });

  test('BACK invokes mainCallback when provided', async () => {
    adminSetup();
    const mainCallback = jest.fn();

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={mainCallback} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('btn-BACK'));
    expect(mainCallback).toHaveBeenCalled();
  });

  test('switching class calls switchUserClass and refreshUserContext', async () => {
    adminSetup();

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('switch-row-c1'));

    await waitFor(() => {
      expect(mockSwitchUserClass).toHaveBeenCalledWith('teacher-uid-1', 'org-1', 'c1', firebaseApp);
      expect(mockRefreshUserContext).toHaveBeenCalledWith(firebaseApp);
    });
  });

  test('Student role loads classes and shows student guidance copy', async () => {
    studentSetup();

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    expect(mockGetUserClassesInOrg).toHaveBeenCalled();
    expect(screen.getByText('Select a class to view available content')).toBeInTheDocument();
  });

  test('deleteClass is not called when user cancels the confirm dialog', async () => {
    adminSetup();
    window.confirm.mockReturnValue(false);

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('delete-row-c1'));

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDeleteClass).not.toHaveBeenCalled();
  });

  test('Student role does not see CREATE CLASS, ASSIGN GAMES, or ASSIGN USERS buttons', async () => {
    studentSetup();

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    expect(screen.queryByTestId('btn-CREATE-CLASS')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-ASSIGN-GAMES')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-ASSIGN-USERS')).not.toBeInTheDocument();
  });

  test('alerts with failure message when createClass throws an error', async () => {
    adminSetup();
    window.prompt.mockReturnValue('New Class');
    mockCreateClass.mockRejectedValue(new Error('Network error'));

    render(<ClassManager width={800} height={600} firebaseApp={firebaseApp} mainCallback={jest.fn()} />);

    await waitFor(() => screen.getByText('CLASS MANAGEMENT'));

    fireEvent.click(screen.getByTestId('btn-CREATE-CLASS'));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Failed to create class');
    });
  });
});

describe('ClassObject', () => {
  test('returns null when classData is missing', () => {
    const { container } = render(
      <ClassObject
        width={400}
        height={40}
        x={0}
        y={0}
        classData={null}
        index={0}
        isCurrent={false}
        currentUserRole="Teacher"
        onSwitch={() => {}}
        onDelete={() => {}}
        studentCount={0}
        gameCount={0}
        creatorEmail="a@b.com"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('required display fields use safe fallbacks when properties are missing', () => {
    const { container } = render(
      <ClassObject
        width={400}
        height={40}
        x={0}
        y={0}
        classData={{ name: undefined, isDefault: false, teachers: {} }}
        index={0}
        isCurrent={false}
        currentUserRole="Admin"
        onSwitch={() => {}}
        onDelete={() => {}}
        studentCount={undefined}
        gameCount={undefined}
        creatorEmail={undefined}
      />
    );
    expect(container).toBeTruthy();
  });
});
