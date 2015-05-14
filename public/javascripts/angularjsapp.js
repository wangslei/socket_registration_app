var RedisReg = angular.module("RedisReg", ['smart-table', 'ui.bootstrap'], function ($interpolateProvider) {
        $interpolateProvider.startSymbol("{[{");
        $interpolateProvider.endSymbol("}]}");
    }
);

var RegController = RedisReg.controller('MainCtrl', ['$scope', '$http', '$modal', function ($scope, $http, $modal) {
	$scope.test = 'Hello!';
	$scope.attendeelist={};
	$scope.events = [
		{"name": "GoogleIO"},
		{"name": "WWDC"},
		{"name": "ReInvent"},
		{"name": "Coca Cola"}
	];
	$scope.myevent = $scope.events[0];
	
	$scope.getemails = function() {
		$http.get('/getemails',{
			params: {event: $scope.myevent.name}
		}).
		  success(function(data, status, headers, config) {
		  	alert(data);
		  }).
		  error(function(data, status, headers, config) {
		  	console.log("Error in getemails: "+data);
		  });
	};
	
	$scope.getlist = function() {
		if(!angular.isObject($scope.myevent))
			alert("Please select an event to display attendee list!");
		else {
			$http.get('/getlist',{
				params: {event: $scope.myevent.name}
			}).
			  success(function(data, status, headers, config) {
			  	$scope.attendeelist=data;
			  	console.log("Success in getlist: "+data);
			  }).
			  error(function(data, status, headers, config) {
			  	console.log("Error in getlist: "+data);
			  });
		}
   	};
   	$scope.save = function() {
   		var postData = {
   			event: $scope.myevent.name,
   			name: $scope.attendeename,
   			email: $scope.attendeeemail,
   			company: $scope.attendeecompany
   		};
		$http.post('/addattendee',postData).
		  success(function(data, status, headers, config) {
		    console.log("Success in save: "+data);
		    $scope.getlist();
		  }).
		  error(function(data, status, headers, config) {
		  	console.log("Error in save: "+data);
		  });
		//$scope.getlist();
   	};
   	
   	$scope.removeattendee = function(attendee) {
   		//need to call backend service to remove the correct hash and update name and email indices
   		var postData = {
   			event: $scope.myevent.name,
   			name: attendee.name,
   			email: attendee.email,
   			company: attendee.company
   		};
		$http.post('/removeattendee',postData).
		  success(function(data, status, headers, config) {
		    console.log("Success in removeattendee: "+data);
		    $scope.getlist();
		  }).
		  error(function(data, status, headers, config) {
		  	console.log("Error in removeattendee: "+data);
		  });
		//getlist();
   	};
   	
   	$scope.editattendee = function(attendee) {
   		var editedattendeeinfo = {
   			event: $scope.myevent.name,
   			name: attendee.name,
   			email: attendee.email,
   			company: attendee.company
   		};
   		
   		var modalInstance = $modal.open({
			templateUrl: 'myModalContent.html',
			controller: 'ModalInstanceCtrl',
			size: 'sm',
			resolve: {
				editedattendeeinfo: function () {
					return editedattendeeinfo;
				}
			}
		});

		modalInstance.result.then(function (editedattendeeinfo) {
			var originalinfo = {
				event: $scope.myevent.name,
	   			name: attendee.name,
	   			email: attendee.email,
	   			company: attendee.company
			};
			var postData={};
			postData["original"]=originalinfo;
			postData["edited"]=editedattendeeinfo;
			if(editedattendeeinfo.event!=$scope.myevent.name) {
				postData["whattochange"]="everything";
			}
			else {
				if(editedattendeeinfo.name!=attendee.name || editedattendeeinfo.email!=attendee.email)
					postData["whattochange"]="nameemail";
				else {
					if(editedattendeeinfo.company!=attendee.company)
						postData["whattochange"]="company";
					else
						postData["whattochange"]="nothing";
				}
			}
			if(postData["whattochange"]=="everything") {
				$http.post('/addattendee',postData["edited"]).
				  success(function(data, status, headers, config) {
				    if(data[0]=="Attendee added!") {
				    	$http.post('/removeattendee',postData["original"]).
						  success(function(data, status, headers, config) {
						    if(data[0]=="Attendee removed.") {
						    	console.log("Success in editattendee: "+data);
						    }
						    $scope.getlist();
						  }).
						  error(function(data, status, headers, config) {
						  	console.log("Error in editattendee (removeattendee): "+data);
						  });
				    }
				    else {
				    	alert("Cannot complete edit because attendee already exists");
				    }
				  }).
				  error(function(data, status, headers, config) {
				  	console.log("Error in editattendee (addattendee): "+data);
				  });
			}
			else if (postData["whattochange"]!="nothing") {
				$http.post('/editattendee',postData).
				success(function(data, status, headers, config) {
					console.log("Success in editattendee (real): "+data);
					$scope.getlist();
				}).
				error(function(data, status, headers, config) {
					console.log("Error in editattendee (real): "+data);
				});
			}
		}, function () {
			console.log('Modal dismissed at: ' + new Date());
		});
   		
	};
}]);

var ModalController = angular.module('RedisReg').controller('ModalInstanceCtrl', function ($scope, $modalInstance, editedattendeeinfo) {

	$scope.events = [
		{"name": "GoogleIO"},
		{"name": "WWDC"},
		{"name": "ReInvent"},
		{"name": "Coca Cola"}
	];
	
	$scope.setbefores = function () {
		if(editedattendeeinfo.event=="GoogleIO")	$scope.mevent=$scope.events[0];
		else if (editedattendeeinfo.event=="WWDC")	$scope.mevent=$scope.events[1];
		else $scope.mevent=$scope.events[2];
		$scope.modalname=editedattendeeinfo.name;
		$scope.modalemail=editedattendeeinfo.email;
		$scope.modalcompany=editedattendeeinfo.company;
	};
	
	$scope.ok = function () {
		editedattendeeinfo.event=$scope.mevent.name;
		editedattendeeinfo.name=$scope.modalname;
		editedattendeeinfo.email=$scope.modalemail;
		editedattendeeinfo.company=$scope.modalcompany;
		$modalInstance.close(editedattendeeinfo);
	};

	$scope.cancel = function () {
		$modalInstance.dismiss('cancel');
	};
});