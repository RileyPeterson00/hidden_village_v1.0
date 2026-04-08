import React, { useEffect, useState } from "react";
import Loader from "./utilities/Loader.js";
import Home from "./Home.js";
import OrganizationSelector from "./OrganizationSelector.js";
import { useMachine } from "@xstate/react";
import { StoryMachine } from "../machines/storyMachine.js";
import { Stage } from "@inlet/react-pixi";
import { yellow } from "../utils/colors";
import { generateRowAndColumnFunctions } from "./utilities/layoutFunction";
import { app } from "../firebase/init";
import { getAuth, signOut, onAuthStateChanged as onAuthStateChangedModular } from "firebase/auth";
import PlayMenu from "./PlayMenu/PlayMenu.js";
import { getCurrentUserContext, getUserNameFromDatabase, getCurrentUserOrgInfo } from "../firebase/userDatabase";

// Layout constants
const [
  numRows,
  numColumns,
  marginBetweenRows,
  marginBetweenColumns,
  columnGutter,
  rowGutter,
] = [2, 3, 20, 20, 30, 30];

const Story = () => {
  const [height, setHeight] = useState(window.innerHeight);
  const [width, setWidth] = useState(window.innerWidth);
  const [state, send] = useMachine(StoryMachine);
  const [userName, setUserName] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userOrg, setUserOrg] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Get Firebase app instance
  const firebaseApp = app;

  let [rowDimensions, columnDimensions] = generateRowAndColumnFunctions(
    width,
    height,
    numRows,
    numColumns,
    marginBetweenRows,
    marginBetweenColumns,
    columnGutter,
    rowGutter
  );

  // Check auth state
  useEffect(() => {
    const auth = getAuth(firebaseApp);
    const unsubscribe = onAuthStateChangedModular(auth, (user) => {
      if (!user) {
        window.location.href = "/signin";
      } else {
        setIsAuthenticated(true);
      }
    });
    return () => unsubscribe();
  }, [firebaseApp]);

  // Fetch user name and role after auth
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchUserData = async () => {
      try {
        const [name, userContext, orgInfo] = await Promise.all([
          getUserNameFromDatabase(firebaseApp),
          getCurrentUserContext(firebaseApp),
          getCurrentUserOrgInfo(firebaseApp),
        ]);

        if (name && name !== "USER NOT FOUND") {
          setUserName(name);
        } else {
          // console.warn("User name not found.");
        }

        // console.log('User context:', userContext);
        // console.log('User role from context:', userContext.role);
        setUserRole(userContext.role);
        setUserOrg(orgInfo.orgName);
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, [isAuthenticated]);

  // Listen for user context changes (organization/class switches)
  useEffect(() => {
    const handleUserContextChange = () => {
      // console.log('Story.js: User context changed, refreshing user data...');
      const fetchUserData = async () => {
        try {
          // console.log('Story.js: Fetching updated user data...');
          const [name, userContext, orgInfo] = await Promise.all([
            getUserNameFromDatabase(firebaseApp),
            getCurrentUserContext(firebaseApp),
            getCurrentUserOrgInfo(firebaseApp),
          ]);

          if (name && name !== "USER NOT FOUND") {
            // console.log('Story.js: Updated userName:', name);
            setUserName(name);
          } else {
            // console.warn("Story.js: User name not found.");
          }

          // console.log('Story.js: Updated user context:', userContext);
          // console.log('Story.js: Updated user role from context:', userContext.role);
          // console.log('Story.js: Updated organization:', orgInfo.orgName);
          setUserRole(userContext.role);
          setUserOrg(orgInfo.orgName);
        } catch (error) {
          console.error("Story.js: Error refreshing user data:", error);
        }
      };

      fetchUserData();
    };

    // Add event listener
    // console.log('Story.js: Adding userContextChanged event listener');
    window.addEventListener('userContextChanged', handleUserContextChange);

    // Cleanup
    return () => {
      // console.log('Story.js: Removing userContextChanged event listener');
      window.removeEventListener('userContextChanged', handleUserContextChange);
    };
  }, [firebaseApp]);

  // Handle window resize to update dimensions
  useEffect(() => {
    const handleResize = () => {
      const newHeight = window.innerHeight;
      const newWidth = window.innerWidth;
      setHeight(newHeight);
      setWidth(newWidth);
      [rowDimensions, columnDimensions] = generateRowAndColumnFunctions(
        newWidth,
        newHeight,
        numRows,
        numColumns,
        marginBetweenRows,
        marginBetweenColumns,
        columnGutter,
        rowGutter
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Gate for moving to "ready" state
  useEffect(() => {
    if (
      isAuthenticated &&
      userName &&
      userName !== "USER NOT FOUND" &&
      userRole &&
      userOrg &&
      state.value === "loading"
    ) {
      send("TOGGLE"); // Go to "ready"
    }
  }, [isAuthenticated, userName, userRole, userOrg, state, send]);

  const loading =
    !isAuthenticated || !userName || userName === "USER NOT FOUND";
  
  const needsOrganizationSelection = 
    isAuthenticated && userName && userName !== "USER NOT FOUND" && (!userRole || !userOrg);

  return (
    <>
      {loading ? (
        <Loader />
      ) : needsOrganizationSelection ? (
        <Stage
          height={height}
          width={width}
          options={{
            antialias: true,
            autoDensity: true,
            backgroundColor: yellow,
          }}
        >
          <OrganizationSelector
            width={width}
            height={height}
            onOrganizationSelected={() => {
              // This will trigger a page reload, so no need to handle state
            }}
          />
        </Stage>
      ) : (
        <Stage
          height={height}
          width={width}
          options={{
            antialias: true,
            autoDensity: true,
            backgroundColor: yellow,
          }}
        >
          {state.value === "ready" && (
            <Home
              width={width}
              height={height}
              startCallback={() => send("TOGGLE")}
              logoutCallback={() => signOut(getAuth(firebaseApp))}
              userName={userName}
            />
          )}

          {state.value === "main" && (
            <PlayMenu
              width={width}
              height={height}
              columnDimensions={columnDimensions}
              rowDimensions={rowDimensions}
              userName={userName}
              role={userRole}
              organization={userOrg}
              logoutCallback={() => signOut(getAuth(firebaseApp))}
            />
          )}
        </Stage>
      )}
    </>
  );
};

export default Story;
