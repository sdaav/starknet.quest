"use client";
import React, { useCallback, useContext, useEffect, useState } from "react";
import styles from "@styles/dashboard.module.css";
import DashboardSkeleton from "@components/skeletons/dashboardSkeleton";
import ProfileCard from "@components/UI/profileCard/profileCard";
import BoostCard from "@components/quest-boost/boostCard";
import { LeaderboardRankingParams, LeaderboardTopperParams, fetchLeaderboardRankings, fetchLeaderboardToppers, getCompletedBoosts, getCompletedQuests, getQuestById } from "@services/apiService"; 
import { useAccount } from "@starknet-react/core";
import { useStarkProfile } from "@starknet-react/core";
import { calculatePercentile } from "@utils/numberService";
import QuestCard from "@components/quests/questCard";
import Blur from "@components/shapes/blur";
import { utils } from "starknetid.js";
import { StarknetIdJsContext } from "@context/StarknetIdJsProvider";
import { decimalToHex, hexToDecimal } from "@utils/feltService";
import { isHexString, minifyAddress } from "@utils/stringService";
import { useRouter } from "next/router";
import Quest from "@components/quests/quest";
import CompletedQuests from "@components/dashboard/completedQuests";
import { QuestsContext } from "@context/QuestsProvider";
import { rankOrder, rankOrderMobile } from "@constants/common";
import { getDomainFromAddress } from "@utils/domainService";
import { timeFrameMap } from "@utils/timeService";



interface RankAndTotalUsers {
  userRank: number;
  totalUsers: number;
}



export default function DashboardPage (userRank : RankAndTotalUsers, totalUsers: RankAndTotalUsers){
  const { address } = useAccount();
  const { data: profileData, isLoading, isError } = useStarkProfile({ address });
  const [userPercentile, setUserPercentile] = useState<number>();
  const { starknetIdNavigator } = useContext(StarknetIdJsContext);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [numOfCompletedQuests, setNumOfCompletedQuests] = useState<number>(0);
  const [initProfile, setInitProfile] = useState(false);
  const [identity, setIdentity] = useState<Identity>(); 
  const [notFound, setNotFound] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [achievements, setAchievements] = useState<BuildingsInfo[]>([]); 
  const { completedQuests } = useContext(QuestsContext);
  const [ranking, setRanking] = useState<RankingData>({
    first_elt_position: 0,
    ranking: [],
  });
  const [rankingdataloading, setRankingdataloading] = useState<boolean>(false);
  const [duration, setDuration] = useState<string>("Last 7 Days");



  const fetchRankingResults = useCallback(
    async (requestBody: LeaderboardRankingParams) => {
      const response = await fetchLeaderboardRankings(requestBody);         
        setRanking(response); 
    },
    []
  );

  const fetchLeaderboardToppersResult = useCallback( 
    async (requestBody: LeaderboardTopperParams) => {
      const topperData = await fetchLeaderboardToppers(requestBody);
      setLeaderboardToppers(topperData);
    },
    []
  );

  const fetchPageData = useCallback(async ()=> { 
    const requestBody = {
      addr:
        status === "connected"
          ? hexToDecimal(address && address?.length > 0 ? address : "Connect Wallet")
          : "",
      page_size: 10,
      shift: 0,
      duration: timeFrameMap(duration),
  };
    setRankingdataloading(true);
    await fetchLeaderboardToppersResult({
      addr: requestBody.addr,
      duration: timeFrameMap(duration),
    });
    await fetchRankingResults(requestBody);
    setRankingdataloading(false);

  },[fetchRankingResults,fetchLeaderboardToppersResult,address]);
  
  const [leaderboardToppers, setLeaderboardToppers] = 
    useState<LeaderboardToppersData>({
      best_users: [],
      total_users: 0,
  });

  const [displayData, setDisplayData] = useState<FormattedRankingProps>([]);


  useEffect(() => { 
    setInitProfile(false);
    setAchievements([]);
  }, [address]); 

  useEffect(() => { 
    if (!address) setIsOwner(false);
  }, [address]);


  useEffect(() => {
    const fetchCompletedQuests = async () => {
      try {
        const res = await getCompletedQuests(address ? address : "");
        setNumOfCompletedQuests(res);

        const updatedQuestsResults = await Promise.allSettled(res.map((id: number) => getQuestById(id)));
        const successfulCompletedQuests = updatedQuestsResults.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled').map(result => result.value);

        const questCards = successfulCompletedQuests;

        setQuests((prevQuests: Quest[]) => [
          ...prevQuests,
          ...questCards.filter((quest) => quest !== null),
        ]);

        
      } catch (err) {
        console.log("Error while fetching quests", err);
      }
    };

    fetchCompletedQuests();
  }, [address]);

  



  useEffect(() => {

    // calculate user percentile
    const res = calculatePercentile(
      leaderboardToppers?.position ?? 0,
      leaderboardToppers?.total_users ?? 0
    );
    setUserPercentile(res);
  }, [leaderboardToppers]);


  // DashboardSkeleton needs to be finished and isError is commented for testing
  // the completed quests part

  // if (isLoading) return <DashboardSkeleton />;
  // if (isError) return <span>Error fetching profile...</span>;

  const getIdentityData = async (id: string) => { 
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_STARKNET_ID_API_LINK}/id_to_data?id=${id}`
    );
    console.log(response);
    return response.json();
  };
  
  const completedQuestsCount = quests.length;
  const containerClass = completedQuestsCount > 3 ? styles.centerAligned : styles.leftAligned;

  useEffect(() => { 
    if (
      typeof address === "string" &&
      address?.toString().toLowerCase().endsWith(".stark")
    ) {
      if (
        !utils.isBraavosSubdomain(address) &&
        !utils.isXplorerSubdomain(address)
      ) {
        starknetIdNavigator
          ?.getStarknetId(address)
          .then((id) => {
            getIdentityData(id).then((data: Identity) => {
              if (data.error) {
                setNotFound(true);
                return;
              }
              setIdentity({
                ...data,
                starknet_id: id.toString(),
              });
              if (hexToDecimal(address) === hexToDecimal(data.addr))
                setIsOwner(true);
              setInitProfile(true);
            });
          })
          .catch(() => {
            return;
          });
      } else {
        starknetIdNavigator
          ?.getAddressFromStarkName(address)
          .then((addr) => {
            setIdentity({
              starknet_id: "0",
              addr: addr,
              domain: address,
              is_owner_main: false,
            });
            setInitProfile(true);
            if (hexToDecimal(address) === hexToDecimal(addr)) setIsOwner(true);
          })
          .catch(() => {
            return;
          });
      }
    } else if (
      typeof address === "string" &&
      isHexString(address)
    ) {
      starknetIdNavigator
        ?.getStarkName(hexToDecimal(address))
        .then((name) => {
          if (name) {
            if (
              !utils.isBraavosSubdomain(name) &&
              !utils.isXplorerSubdomain(name)
            ) {
              starknetIdNavigator
                ?.getStarknetId(name)
                .then((id) => {
                  getIdentityData(id).then((data: Identity) => {
                    if (data.error) return;
                    setIdentity({
                      ...data,
                      starknet_id: id.toString(),
                    });
                    if (hexToDecimal(address) === hexToDecimal(data.addr))
                      setIsOwner(true);
                    setInitProfile(true);
                  });
                })
                .catch(() => {
                  return;
                });
            } else {
              setIdentity({
                starknet_id: "0",
                addr: address,
                domain: name,
                is_owner_main: false,
              });
              setInitProfile(true);
              if (hexToDecimal(address) === hexToDecimal(address))
                setIsOwner(true);
            }
          } else {
            setIdentity({
              starknet_id: "0",
              addr: address,
              domain: minifyAddress(address),
              is_owner_main: false,
            });
            setIsOwner(false);
            setInitProfile(true);
          }
        })
        .catch(() => {
          setIdentity({
            starknet_id: "0",
            addr: address,
            domain: minifyAddress(address),
            is_owner_main: false,
          });
          setInitProfile(true);
          if (hexToDecimal(address) === hexToDecimal(address))
            setIsOwner(true);
        });
    } else {
      setNotFound(true);
    }
  }, [address]);

  useEffect(() => {
  console.log("Address or domain:", address);
  // Add other conditions and logs here
}, [address]);

  return (
    <div className={styles.dashboard_container}>
        
        <div className={styles.dashboard_wrapper}>
            <div className={styles.blur1}>
              <Blur green />
            </div>
            <div className={styles.blur2}>
              <Blur green />
            </div>

            {/* Profile Card */}
            <ProfileCard identity={identity} addressOrDomain={address} userPercentile={userPercentile} achievemenets={achievements} data={ranking}/>
      
        </div>

        {/* Completed Quests */}
        <div className={styles.dashboard_completed_tasks_container}>
            <div className={styles.second_header_label}>
                <h2 className={styles.second_header}>Quests Completed</h2>
            </div>
            
            <div className={`${styles.quests_container} ${containerClass}`}>
              
                <CompletedQuests completedQuests={completedQuests} />
                
                {quests?.length === 0 && (
                  <h2 className={styles.noBoosts}>
                    No completed quests at the moment.
                  </h2>
                )}
                
            </div>
            
        </div>
          
    </div>
  );
}
