import {
  matchSegmentToLandmarks,
  segmentSimilarity,
} from "./Pose/pose_drawing_utilities";
import { enrichLandmarks } from "./Pose/landmark_utilities";
import ErrorBoundary from "./utilities/ErrorBoundary.js";
import Pose from "./Pose/index.js";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Text, Container } from "@inlet/react-pixi";
import { white } from "../utils/colors";
import { writeToDatabasePoseMatch, writeToDatabasePoseStart } from "../firebase/database.js";

const MATCH_CONFIG = [
  {"segment": "RIGHT_BICEP", "data": "poseLandmarks"}, 
  {"segment": "RIGHT_FOREARM", "data": "poseLandmarks"},
  {"segment": "LEFT_BICEP", "data": "poseLandmarks"}, 
  {"segment": "LEFT_FOREARM", "data": "poseLandmarks"}
];

const DEFAULT_SIMILARITY_THRESHOLD = 45;
const TRANSITION_DELAY = 1000;

const PoseMatching = (props) => {
  const {
    posesToMatch,
    tolerances,
    columnDimensions,
    onComplete,
    UUID,
    gameID,
    singleMatchPerPose = true,
    repetitions = 3,
  } = props;

  // Debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.debug('[PoseMatching] Component rendered with props:', {
      'posesToMatch': posesToMatch ? `Array(${posesToMatch.length})` : posesToMatch,
      'posesToMatch.length': posesToMatch?.length,
      'tolerances': tolerances,
      'UUID': UUID,
      'gameID': gameID,
      'singleMatchPerPose': singleMatchPerPose,
      'repetitions': repetitions
    });
  }

  // clearer names for state
  const [linearPoseIndex, setLinearPoseIndex] = useState(0); // legacy mode
  const [subPoseIndex, setSubPoseIndex] = useState(0); // 0..uniquePosesCount-1
  const [repIndex, setRepIndex] = useState(0); // 0..repetitions-1
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [text, setText] = useState(() =>
    singleMatchPerPose
      ? `Match pose ${repIndex + 1}.${subPoseIndex + 1} on the left!`
      : `Match pose ${Math.floor(linearPoseIndex / 3) + 1}.${linearPoseIndex % 3 + 1} on the left!`
  );
  const [poseSimilarity, setPoseSimilarity] = useState([]);

  const SUB_GROUP_SIZE = 3;
  const modelColumn = useMemo(() => columnDimensions(1), [columnDimensions]);
  const col2Dim = useMemo(() => columnDimensions(2), [columnDimensions]);
  const playerColumn = useMemo(() => columnDimensions(3), [columnDimensions]);

  // Calculate number of unique poses
  const uniquePosesCount = useMemo(() => {
    if (repetitions > 0 && posesToMatch.length > 0) {
      return Math.floor(posesToMatch.length / repetitions);
    }
    return posesToMatch.length;
  }, [posesToMatch.length, repetitions]);

  const currentPose = useMemo(() => {
    if (singleMatchPerPose) {
      const srcIdx = repIndex * uniquePosesCount + subPoseIndex;
      if (srcIdx >= posesToMatch.length) return {};
      return enrichLandmarks(posesToMatch[srcIdx]);
    }
    if (linearPoseIndex >= posesToMatch.length) return {};
    return enrichLandmarks(posesToMatch[linearPoseIndex]);
  }, [posesToMatch, linearPoseIndex, singleMatchPerPose, repIndex, subPoseIndex, uniquePosesCount]);

  const poseMatchData = useMemo(() => {
    let srcIdx = singleMatchPerPose ? repIndex * uniquePosesCount + subPoseIndex : linearPoseIndex;
    if (srcIdx >= posesToMatch.length) return [];

    const currentPoseData = posesToMatch[srcIdx];
    return MATCH_CONFIG.map((config) => ({
      ...config,
      landmarks: matchSegmentToLandmarks(config, currentPoseData, modelColumn),
    }));
  }, [posesToMatch, linearPoseIndex, modelColumn, singleMatchPerPose, repIndex, subPoseIndex, uniquePosesCount]);

  const currentTolerance = useMemo(() => {
    if (!Array.isArray(tolerances)) return DEFAULT_SIMILARITY_THRESHOLD;

    if (singleMatchPerPose) {
      const idx = subPoseIndex;
      if (idx < tolerances.length && typeof tolerances[idx] === "number" && !isNaN(tolerances[idx]) && tolerances[idx] >= 0) {
        return tolerances[idx];
      }
      return DEFAULT_SIMILARITY_THRESHOLD;
    }

    if (
      linearPoseIndex < tolerances.length &&
      typeof tolerances[linearPoseIndex] === "number" &&
      !isNaN(tolerances[linearPoseIndex]) &&
      tolerances[linearPoseIndex] >= 0
    ) {
      return tolerances[linearPoseIndex];
    }
    return DEFAULT_SIMILARITY_THRESHOLD;
  }, [tolerances, linearPoseIndex, singleMatchPerPose, subPoseIndex]);

  // initialize or log start
  useEffect(() => {
    if (posesToMatch.length > 0 && !isTransitioning && gameID) {
      if (singleMatchPerPose) {
        writeToDatabasePoseStart(`Pose ${repIndex + 1}-${subPoseIndex + 1}`, UUID, gameID);
      } else {
        writeToDatabasePoseStart(
          `Pose ${Math.floor(linearPoseIndex / 3) + 1}-${linearPoseIndex % 3 + 1}`,
          UUID,
          gameID
        );
      }
    }
  }, [linearPoseIndex, isTransitioning, posesToMatch.length, UUID, gameID, singleMatchPerPose, repIndex, subPoseIndex]);

  useEffect(() => {
    if (!singleMatchPerPose) return;
    setText(`Match pose ${repIndex + 1}.${subPoseIndex + 1} on the left!`);
  }, [subPoseIndex, singleMatchPerPose, repIndex]);

  // similarity calculation
  useEffect(() => {
    if (isTransitioning || completed || !poseMatchData.length || !props.poseData.poseLandmarks) {
      setPoseSimilarity([{ similarityScore: 0 }]);
      return;
    }

    const convertedLandmarks = poseMatchData.map((segmentSet) => ({
      segment: segmentSet.segment,
      landmarks: matchSegmentToLandmarks(segmentSet, props.poseData, playerColumn),
    }));

    const similarityScores = poseMatchData.map((segmentSet) => {
      const playerSet = convertedLandmarks.find((converted) => converted.segment === segmentSet.segment).landmarks;
      const modelSet = segmentSet.landmarks;
      const similarityScore = segmentSimilarity(playerSet, modelSet);
      return { segment: segmentSet.segment, similarityScore };
    });

    setPoseSimilarity(similarityScores);
  }, [props.poseData, poseMatchData, playerColumn, isTransitioning, completed]);

  const handlePoseMatch = useCallback(() => {
    if (gameID) {
      if (singleMatchPerPose) {
        writeToDatabasePoseMatch(`Pose ${repIndex + 1}-${subPoseIndex + 1}`, gameID).catch(console.error);
      } else {
        writeToDatabasePoseMatch(
          `Pose ${Math.floor(linearPoseIndex / 3) + 1}-${linearPoseIndex % 3 + 1}`,
          gameID
        ).catch(console.error);
      }
    }

    setIsTransitioning(true);
    setText("Great!");

    setTimeout(() => {
      if (!singleMatchPerPose) {
        const nextIndex = linearPoseIndex + 1;
        if (nextIndex >= posesToMatch.length) {
          setCompleted(true);
          setIsTransitioning(false);
          onComplete();
        } else {
          setLinearPoseIndex(nextIndex);
          setText(`Match pose ${Math.floor(nextIndex / 3) + 1}.${nextIndex % 3 + 1} on the left!`);
          setIsTransitioning(false);
        }
        return;
      }

      // singleMatchPerPose flow - advance sub/rep
      let nextSub = subPoseIndex + 1;
      let nextRep = repIndex;

      if (nextSub >= uniquePosesCount) {
        nextSub = 0;
        nextRep = repIndex + 1;
      }

      if (nextRep >= Math.max(1, Math.floor(repetitions))) {
        setCompleted(true);
        setIsTransitioning(false);
        onComplete();
      } else {
        setSubPoseIndex(nextSub);
        setRepIndex(nextRep);
        setText(`Match pose ${nextRep + 1}.${nextSub + 1} on the left!`);
        setIsTransitioning(false);
        // console.log(`Advanced to rep ${nextRep}, sub ${nextSub}`);
      }
    }, TRANSITION_DELAY);
  }, [
    linearPoseIndex,
    posesToMatch.length,
    gameID,
    onComplete,
    singleMatchPerPose,
    repetitions,
    subPoseIndex,
    repIndex,
    uniquePosesCount,
  ]);

  useEffect(() => {
    if (isTransitioning || completed || poseSimilarity.length === 0) return;

    const allSegmentsMatch = poseSimilarity.every((segment) => segment.similarityScore > currentTolerance);

    if (allSegmentsMatch) {
      // console.log(`Pose matched with tolerance: ${currentTolerance}`);
      handlePoseMatch();
    }
  }, [poseSimilarity, currentTolerance, isTransitioning, handlePoseMatch]);

  if (posesToMatch.length === 0) {
    // console.warn('[PoseMatching] Returning null - posesToMatch.length is 0:', {
    //   'posesToMatch': posesToMatch,
    //   'posesToMatch.length': posesToMatch?.length,
    //   'posesToMatch type': typeof posesToMatch,
    //   'posesToMatch is array': Array.isArray(posesToMatch)
    // });
    return null;
  }

  // Debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.debug('[PoseMatching] Rendering pose matching UI:', {
      'posesToMatch.length': posesToMatch.length,
      'uniquePosesCount': uniquePosesCount,
      'repIndex': repIndex,
      'subPoseIndex': subPoseIndex
    });
  }

  return (
    <Container>
      <ErrorBoundary>
        <Pose poseData={currentPose} colAttr={modelColumn} />
        <Text
          text={text}
          y={col2Dim.height / 2}
          x={col2Dim.x + col2Dim.margin}
          style={
            new PIXI.TextStyle({
              align: "center",
              fontFamily: "Futura",
              fontSize: "4em",
              fontWeight: 800,
              fill: [white],
              wordWrap: true,
              wordWrapWidth: col2Dim.width,
            })
          }
        />
        <Pose poseData={props.poseData} colAttr={playerColumn} similarityScores={poseSimilarity} />
      </ErrorBoundary>
    </Container>
  );
};
export default PoseMatching;
