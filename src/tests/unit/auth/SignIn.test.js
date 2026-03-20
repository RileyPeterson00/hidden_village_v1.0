/**
 * Unit Tests: SignIn component (src/components/auth/SignIn.js)
 *
 * Tests sign-in flow, registration, error handling.
 * Firebase Auth and userDatabase are fully mocked.
 */

import React from 'react';

// Mock CSS and image imports
jest.mock('../../../components/auth/SignIn.css', () => ({}));
jest.mock('../../../assets/circle_sprite.png', () => 'circle_sprite.png');
jest.mock('../../../assets/scaleneTriangle_sprite.png', () => 'scaleneTriangle_sprite.png');
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignInScreen from '../../../components/auth/SignIn.js';

// Mock Firebase Auth
const mockSignInWithEmailAndPassword = jest.fn();
const mockGetAuth = jest.fn(() => ({}));

jest.mock('firebase/auth', () => ({
  getAuth: (...args) => mockGetAuth(...args),
  signInWithEmailAndPassword: (...args) => mockSignInWithEmailAndPassword(...args),
}));

// Mock UserSaver
const mockSaveUsername = jest.fn();
const mockSavePassword = jest.fn();
jest.mock('../../../components/auth/UserSaver.js', () => ({
  saveUsername: (...args) => mockSaveUsername(...args),
  savePassword: (...args) => mockSavePassword(...args),
}));

// Mock registerNewUser
const mockRegisterNewUser = jest.fn();
jest.mock('../../../firebase/userDatabase.js', () => ({
  registerNewUser: (...args) => mockRegisterNewUser(...args),
}));

// Spy on window.location.href for redirect assertions
// We cannot replace window.location in jsdom, so we assert saveUsername/savePassword
// (only called on success before redirect) as proof of successful flow.
const mockFirebaseApp = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SignIn component', () => {
  describe('valid credentials flow', () => {
    test('calls signInWithEmailAndPassword with email and password on submit', async () => {
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: '123' } });

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
      fireEvent.click(screen.getByDisplayValue('LOG IN'));

      await waitFor(() => {
        expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
          expect.anything(),
          'test@example.com',
          'password123'
        );
      });
    });

    test('saves username and password on successful login (redirects to /)', async () => {
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: '123' } });

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@test.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
      fireEvent.click(screen.getByDisplayValue('LOG IN'));

      await waitFor(() => {
        expect(mockSaveUsername).toHaveBeenCalledWith('user@test.com');
        expect(mockSavePassword).toHaveBeenCalledWith('secret');
        // SignIn sets window.location.href = '/' on success; saveUsername/savePassword
        // are only called in the success path right before redirect
      });
    });
  });

  describe('invalid credentials error handling', () => {
    test('shows error message when sign-in fails', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue(new Error('Invalid credentials'));

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'wrong@test.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpass' } });
      fireEvent.click(screen.getByDisplayValue('LOG IN'));

      await waitFor(() => {
        expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument();
        expect(screen.getByText(/please try again/i)).toBeInTheDocument();
      });

      expect(mockSaveUsername).not.toHaveBeenCalled();
    });

    test('does not redirect when credentials are invalid', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue(new Error('Auth failed'));

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.click(screen.getByDisplayValue('LOG IN'));

      await waitFor(() => {
        expect(mockSignInWithEmailAndPassword).toHaveBeenCalled();
      });

      expect(mockSaveUsername).not.toHaveBeenCalled();
    });
  });

  describe('network error handling', () => {
    test('shows error when sign-in fails due to network error', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue(new Error('Network request failed'));

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@test.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });
      fireEvent.click(screen.getByDisplayValue('LOG IN'));

      await waitFor(() => {
        expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument();
      });
    });
  });

  describe('register mode', () => {
    test('toggles to register mode and shows REGISTER button', async () => {
      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.click(screen.getByText(/don't have an account\? register/i));

      expect(screen.getByDisplayValue('REGISTER')).toBeInTheDocument();
    });

    test('calls registerNewUser when in register mode and form is submitted', async () => {
      mockRegisterNewUser.mockResolvedValue(undefined);
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: '456' } });

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.click(screen.getByText(/don't have an account\? register/i));

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@user.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'newpass' } });
      fireEvent.click(screen.getByDisplayValue('REGISTER'));

      await waitFor(() => {
        expect(mockRegisterNewUser).toHaveBeenCalledWith(
          'new@user.com',
          'newpass',
          mockFirebaseApp
        );
      });
    });

    test('shows registration success message and auto-logs in after register', async () => {
      mockRegisterNewUser.mockResolvedValue(undefined);
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: '456' } });

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.click(screen.getByText(/don't have an account\? register/i));
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@user.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'newpass' } });
      fireEvent.click(screen.getByDisplayValue('REGISTER'));

      await waitFor(() => {
        expect(screen.getByText(/registration successful! logging in/i)).toBeInTheDocument();
      });

      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
          expect.anything(),
          'new@user.com',
          'newpass'
        );
        expect(mockSaveUsername).toHaveBeenCalledWith('new@user.com');
      });
    });

    test('shows registration error when registerNewUser fails', async () => {
      mockRegisterNewUser.mockRejectedValue(new Error('Email already in use'));

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.click(screen.getByText(/don't have an account\? register/i));
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'taken@user.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });
      fireEvent.click(screen.getByDisplayValue('REGISTER'));

      await waitFor(() => {
        expect(screen.getByText(/registration failed/i)).toBeInTheDocument();
        expect(screen.getByText(/email may already be in use/i)).toBeInTheDocument();
      });
    });

    test('clears errors when toggling between login and register', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue(new Error('Invalid'));

      render(<SignInScreen firebaseApp={mockFirebaseApp} />);

      fireEvent.click(screen.getByDisplayValue('LOG IN'));

      await waitFor(() => {
        expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/don't have an account\? register/i));

      expect(screen.queryByText(/email or password is incorrect/i)).not.toBeInTheDocument();
    });
  });
});
